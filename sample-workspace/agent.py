import sys
import os
import re
import ast
import google.generativeai as genai

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
LLM_MODEL_NAME = "gemini-2.0-flash-lite"

def get_culprit_code(workspace_root, error_log):
    matches = re.findall(r'File "(.*?)", line (\d+)', error_log)
    if not matches:
        return None, None
    for filename, line_num in reversed(matches):
        abs_path = os.path.abspath(os.path.join(workspace_root, filename))
        if workspace_root in abs_path and os.path.exists(abs_path):
            try:
                with open(abs_path, 'r') as f:
                    lines = f.readlines()
                    # return context: +/- 5 lines around the error.
                    start = max(0, int(line_num) - 6)
                    end = min(len(lines), int(line_num) + 5)
                    snippet = "".join(lines[start:end])
                    return abs_path, snippet
            except Exception:
                continue
    return None, None

def query_llm(prompt):
    try:
        if not GEMINI_API_KEY:
            return "Error: GEMINI_API_KEY not set."
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel(
            model_name=LLM_MODEL_NAME,
            generation_config={"temperature": 0.2},
        )
        response = model.generate_content(prompt)
        # print("=== Agent Prompt ===", file=sys.stderr)
        # print(prompt, file=sys.stderr)
        # print("=== Agent Response ===", file=sys.stderr)
        # print(response, file=sys.stderr)
        if response.parts:
            return response.text
        return f"Agent analysis was blocked. This can be due to safety filters or other restrictions. Feedback: {response.prompt_feedback}"
    except Exception as e:
        return f"Agent Error: {str(e)}"

def analyze_single_failure(backend, error_log, workspace_root):
    filepath, code_snippet = get_culprit_code(workspace_root, error_log)
    if not filepath:
        return "Could not isolate the specific source code causing the error."
    prompt = f"""
    You are an expert in Keras 3 backend compatibility.
    
    CONTEXT:
    The user's code passed on some backends but FAILED on **{backend}**.
    
    THE CODE (from {os.path.basename(filepath)}):
    ```python
    {code_snippet}
    ```
    
    THE ERROR:
    {error_log}
    
    TASK:
    Explain why this fails specifically on {backend} while working on others. 
    Provide a brief, 1-sentence diagnosis and a 1-sentence fix. 
    Do not explain basic Python concepts. Focus on Keras Backend differences.
    
    FORMAT:
    **Diagnosis:** [your diagnosis]
    **Fix:** [your fix]
    """
    return query_llm(prompt)

def analyze_dual_failure(backends, errors, workspace_root):
    backend1, backend2 = backends.split(',')
    combined_errors = errors
    filepath, code_snippet = get_culprit_code(workspace_root, combined_errors)
    code_section = f"""
    THE CODE (from {os.path.basename(filepath) if filepath else 'unknown'}):
    ```python
    {code_snippet if code_snippet else 'Could not extract code snippet'}
    ```
    """ if filepath else ""
    prompt = f"""
    You are an expert in Keras 3 backend compatibility.
    
    CONTEXT:
    The user's code FAILED on **{backend1}** and **{backend2}**, but passed on the third backend.
    
    {code_section}
    
    THE ERRORS:
    {combined_errors}
    
    TASK:
    Analyze why this code fails on both {backend1} and {backend2} but works on the third backend.
    Identify the common compatibility issue and provide a unified fix.
    Keep your response concise (2-3 sentences for diagnosis, 1-2 for fix).
    
    FORMAT:
    **Diagnosis:** [your diagnosis]
    **Fix:** [your unified fix]
    """
    return query_llm(prompt)

def analyze_compatibility_tips(code_content):
    issues = []
    backend_imports = re.findall(r'import (torch|tensorflow|jax)', code_content)
    if backend_imports:
        issues.append(f"⚠️ Direct backend import detected: {', '.join(set(backend_imports))}. Consider using keras.ops instead.")
    torch_ops = re.findall(r'torch\.(\w+)', code_content)
    if torch_ops:
        issues.append(f"⚠️ PyTorch-specific operations found: {', '.join(set(torch_ops))}. Use keras.ops equivalents.")
    tf_ops = re.findall(r'tf\.(\w+)', code_content)
    if tf_ops:
        issues.append(f"⚠️ TensorFlow-specific operations found: {', '.join(set(tf_ops))}. Use keras.ops equivalents.")
    prompt = f"""
    Analyze this Keras code for potential backend compatibility issues.
    Focus on operations that might work on one backend but fail on others.
    
    ```python
    {code_content[:2000]}  # Limit to first 2000 chars
    ```
    
    List 2-3 specific potential compatibility issues (if any) in this format:
    - [Issue description]
    
    If no issues found, respond with: "No obvious compatibility issues detected."
    """
    llm_tips = query_llm(prompt)
    if llm_tips and "no" not in llm_tips.lower()[:30]:
        issues.append(llm_tips)
    return issues if issues else ["✅ No obvious compatibility issues detected."]

def extract_classes_and_functions(code_content):
    try:
        tree = ast.parse(code_content)
        items = []
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                docstring = ast.get_docstring(node) or "No description"
                items.append(f"**Class {node.name}**: {docstring.split(chr(10))[0][:100]}")
            elif isinstance(node, ast.FunctionDef) and node.col_offset == 0:
                docstring = ast.get_docstring(node) or "No description"
                items.append(f"**Function {node.name}**: {docstring.split(chr(10))[0][:100]}")
        return items
    except:
        return []

def generate_summary(code_content):
    items = extract_classes_and_functions(code_content)
    if not items:
        return "Could not extract class/function information from this file."
    items_text = "\n".join(items)
    prompt = f"""
    You are analyzing a Keras code module. Provide a concise summary.
    
    DETECTED CLASSES/FUNCTIONS:
    {items_text}
    
    CODE PREVIEW:
    ```python
    {code_content[:3000]}  # First 3000 chars
    ```
    
    TASK:
    Provide a brief summary (3-5 sentences) describing:
    1. The main purpose of this module
    2. Key classes/functions and their roles
    3. Any notable patterns or design choices
    
    Keep it technical but accessible.
    """
    return query_llm(prompt)

def summarize_entity(code_content, entity_name):
    try:
        tree = ast.parse(code_content)
        target_node = None
        for node in ast.walk(tree):
            if isinstance(node, (ast.ClassDef, ast.FunctionDef)) and node.name == entity_name:
                target_node = node
                break
        if not target_node:
            return f"Could not find entity '{entity_name}'."
        lines = code_content.splitlines()
        start = target_node.lineno - 1
        end = target_node.end_lineno
        entity_source = "\n".join(lines[start:end])
        prompt = f"""
        Summarize this Python {type(target_node).__name__}: '{entity_name}'.
        CODE:
        ```python
        {entity_source}
        ```
        TASK: Provide a concise (2-3 sentences) explanation of what this component does, its inputs/outputs, and its logic.
        """
        return query_llm(prompt)
    except Exception as e:
        return f"Error: {str(e)}"

def main():
    if len(sys.argv) < 3:
        print("Usage: python agent.py <mode/backend> <workspace_root>")
        sys.exit(1)
    mode_or_backend = sys.argv[1]
    workspace_root = sys.argv[2]
    input_data = sys.stdin.read()
    if mode_or_backend == "summarize":
        summary = generate_summary(input_data)
        print(summary)
    elif mode_or_backend == "summarize-entity":
        entity_name = sys.argv[3] if len(sys.argv) > 3 else ""
        print(summarize_entity(input_data, entity_name))
    elif mode_or_backend == "compatibility-check":
        # compat tips.
        tips = analyze_compatibility_tips(input_data)
        for tip in tips:
            print(tip)
    elif ',' in mode_or_backend:
        # dual fails.
        analysis = analyze_dual_failure(mode_or_backend, input_data, workspace_root)
        print(analysis)
    else:
        # single backend fails.
        analysis = analyze_single_failure(mode_or_backend, input_data, workspace_root)
        print(analysis)

if __name__ == "__main__":
    main()
