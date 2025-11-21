<p align="center">
  <img src="https://github.com/user-attachments/assets/1c0f7ef7-c254-4a01-81e0-f7dfb03a3dfe" width="300">
</p>

<h1 align="center">Cerberus: Google Antigravity Extension with Gemini Insights for Keras Development</h1>

<div align="center">
  <a href="https://www.youtube.com/embed/45kM17whfZo">
    <img 
      src="https://img.youtube.com/vi/45kM17whfZo/hqdefault.jpg" 
      alt="Watch the video"
      width="600"
    >
  </a>
</div>
<p align="center"><em>Video Tutorial!</em></p>

**Cerberus** is a Google Antigravity extension designed to streamline the development and testing of multi-backend Keras models. It uses Gemini to ensure compatibility and provide Gemini-powered insights across different backend environments such as TensorFlow, JAX, and PyTorch. Cerberus helps you pre-emptively detect compatibility issues across backends and remain mindful of decisions that may cause problems down the line.
Inspired from the mythical Cerberus that guards the underworld with its three heads, this extension simultaneously watches over your code’s behavior on three Keras backends, catching inconsistencies and failures before they become major issues.

## Features
Cerberus integrates seamlessly into your Google Antigravity workflow, offering two primary sidebar views: the **Test Suite View** and the **Core Modules View**.

### Test Suite View
This view is your command center for multi-backend compatibility testing.
*   **Automatic Testing on Save**: Designate files as part of your "Test Suite". Every time you save one of these files, Cerberus automatically runs it against your configured Keras backends (e.g., `tensorflow`, `jax`, `torch`).
*   **Real-time Status Dashboard**: Get immediate visual feedback on which backends pass or fail. The status for each configured backend is clearly displayed in the sidebar.
*   **Gemini-Powered Diagnostics**: When a test fails on one or more backends, Cerberus invokes its Gemini-powered agent to analyze the error logs and code. It provides concise, actionable insights explaining *why* the failure occurred and suggests a potential fix, directly within the test results.
*   **Unified Insights**: If a test fails on multiple backends for the same reason, Cerberus provides a single, unified analysis, saving you from deciphering redundant error messages.
Once running, simply press **Ctrl + S** in any Test Suite file to trigger multi-backend testing.

### Core Modules View

This view helps you analyze, understand, and improve your core Python modules for multi-backend compatibility.

*   **Code Structure Outline**: Automatically detects and lists all classes and functions in the active Python file, providing a quick-navigation outline.
*   **Jump to Definition**: Instantly navigate to the definition of any class or function in the editor by clicking on it in the view.
*   **Gemini-Generated Summaries**:
    *   **Module Summary**: Generate a high-level summary of the entire file to quickly understand its purpose and key components.
    *   **Entity Summary**: Drill down and generate a summary for a specific class or function to understand its role and logic.
*   **Live Compatibility Analysis**: Enable "Core Module Monitoring" to get real-time compatibility tips as you save your files. The agent analyzes your code for patterns that might cause issues across different Keras backends.

## Setup & Configuration

1. **Clone the Repository**: Run it in Debug Mode using Google Antigravity (press F5, which launches Cerberus-beta in the `sample-workspace` for you).

2. **API Key Configuration**: Cerberus uses the Google Gemini API for its Gemini-powered features. You need to set up an API key as an environment variable.

    ```bash
    # For Linux/macOS (add to .bashrc, .zshrc, etc.)
    export GEMINI_API_KEY="YOUR_API_KEY"
    # For Windows (PowerShell)
    $env:GEMINI_API_KEY="YOUR_API_KEY"
    ```

3. **Workspace Settings (`settings.json`)**: Configure the extension to suit your project's needs.

    ```json
    {
      "cerberus.activeHeads": [
        "tensorflow",
        "jax",
        "torch"
      ],
      "cerberus.monitorCoreModules": true,
      "cerberus.enableAgentSummaries": true
    }
    ```

    - `cerberus.activeHeads`: An array of Keras backends to test against.
    - `cerberus.monitorCoreModules`: Set to `true` to enable live compatibility analysis on save for files classified as "Core Modules".
    - `cerberus.enableAgentSummaries`: Set to `true` to enable Gemini-powered diagnostics for test failures.

4. **Python Agent**: The extension relies on a Python script (`agent.py`) to communicate with the Gemini API. Ensure this script is present in your workspace root. It requires the `google-generativeai` library.

    ```
    pip install google-generativeai
    ```

## Usage

### Classifying Files
To start using Cerberus, you need to tell it which files to watch.
1.  **Right-click** on a file in the Explorer Menu.
2.  Select **"Cerberus: Classify as Test Suite File"** or **"Cerberus: Classify as Core Module"**.
This adds the file to the extension's internal list, which is stored in your workspace `settings.json`.
*   **Test Suite Files**: When saved, these files will be executed against the `cerberus.activeHeads`. The results will appear in the **Test Suite View**.
*   **Core Modules**: These files can be analyzed for summaries and compatibility tips in the **Core Modules View**.
To remove a file's classification, right-click and select **"Cerberus: Remove Classification"**.

### Running Tests
Simply **save a file** that has been classified as a "Test Suite File". The Test Suite View will automatically update to show a "running" state, followed by the `PASS`/`FAIL` results for each backend.
If a test fails, expand the result card to view the error log and the Gemini-generated insight.

### Analyzing Core Modules
1.  Open a Python file. The **Core Modules View** will populate with its classes and functions.
2.  Click **"Generate Summary"** to get an Gemini-powered overview of the entire module.
3.  Click on any class or function in the list to expand its summary section. If a summary hasn't been generated yet, it will be fetched on-demand.

## Commands
You can access Cerberus commands through the Command Palette (`Ctrl + Shift + P` or `Cmd + Shift + P`):
*   `Cerberus: Classify as Test Suite File`: Adds the active file to the test suite.
*   `Cerberus: Remove Classification`: Removes the active file from Cerberus's configuration.
*   `Cerberus: Generate Summary`: Generates a summary for the active core module file.

## Contributing
This project is open for contributions. Please feel free to open an issue or submit a pull request.
1.  **Fork** the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a **Pull Request**.

## License

This project is licensed under the Apache-2.0 License - see the [LICENSE.md](https://github.com/harshaljanjani/cerberus/blob/main/LICENSE.md) file for details.

*Happy multi-backend coding with Keras; may Cerberus make it smoother and smarter for you!*
