import sys
import os
import re
import google.generativeai as genai

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
LLM_MODEL_NAME = "gemini-2.5-flash"

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

def analyze_failure(backend, error_log, workspace_root):
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
    """
    return query_llm(prompt)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python cerberus_agent.py <backend> <workspace_root>")
        sys.exit(1)
    backend_arg = sys.argv[1]
    root_arg = sys.argv[2]
    error_log_stdin = sys.stdin.read()
    analysis = analyze_failure(backend_arg, error_log_stdin, root_arg)
    print(analysis)
