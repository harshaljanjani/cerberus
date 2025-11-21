import * as vscode from 'vscode';
import { StatusViewProvider } from './status-view-provider';
import { CoreModulesViewProvider } from './core-modules-view-provider';
import { runCheck, CheckResult } from './backend-runner';
import * as path from 'path';
import { exec } from 'child_process';

interface FileClassification {
    testSuite: string[];
    coreModules: string[];
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "cerberus" is now active!');
    const statusSidebar = new StatusViewProvider(context.extensionUri);
    const coreModulesSidebar = new CoreModulesViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(StatusViewProvider.viewType, statusSidebar)
    );
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(CoreModulesViewProvider.viewType, coreModulesSidebar)
    );

    const classifyAsTestCommand = vscode.commands.registerCommand('cerberus.classifyAsTest', async (uri?: vscode.Uri) => {
        let filePath = uri?.fsPath;
        if (!filePath) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No file selected to classify.');
                return;
            }
            filePath = editor.document.uri.fsPath;
        }
        await addFileToClassification(filePath, 'testSuite');
        vscode.window.showInformationMessage(`Added ${path.basename(filePath)} to Test Suite.`);
    });
    const classifyAsCoreCommand = vscode.commands.registerCommand('cerberus.classifyAsCore', async (uri?: vscode.Uri) => {
        let filePath = uri?.fsPath;
        if (!filePath) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No file selected to classify.');
                return;
            }
            filePath = editor.document.uri.fsPath;
        }
        await addFileToClassification(filePath, 'coreModules');
        vscode.window.showInformationMessage(`Added ${path.basename(filePath)} to Core Modules.`);
    });
    const removeClassificationCommand = vscode.commands.registerCommand('cerberus.removeClassification', async (uri?: vscode.Uri) => {
        let filePath = uri?.fsPath;
        if (!filePath) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No file selected to remove.');
                return;
            }
            filePath = editor.document.uri.fsPath;
        }
        await removeFileFromClassification(filePath);
        vscode.window.showInformationMessage(`Removed ${path.basename(filePath)} from classification.`);
    });
    const generateSummaryCommand = vscode.commands.registerCommand('cerberus.generateSummary', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active file.');
            return;
        }
        await generateCoreModuleSummary(editor.document, coreModulesSidebar);
    });
    const toggleAgentCommand = vscode.commands.registerCommand('cerberus.toggleAgent', async () => {
        const config = vscode.workspace.getConfiguration('cerberus');
        const current = config.get<boolean>('enableAgentSummaries', true);
        await config.update('enableAgentSummaries', !current, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(`Agent summaries ${!current ? 'enabled' : 'disabled'}.`);
    });
    context.subscriptions.push(
        classifyAsTestCommand,
        classifyAsCoreCommand,
        removeClassificationCommand,
        generateSummaryCommand,
        toggleAgentCommand
    );
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async document => {
        const classification = await getFileClassification();
        const filePath = document.uri.fsPath;
        if (classification.testSuite.includes(filePath)) {
            await handleTestSuiteFileSave(document, statusSidebar);
        } else if (classification.coreModules.includes(filePath)) {
            const config = vscode.workspace.getConfiguration('cerberus');
            const monitorCore = config.get<boolean>('monitorCoreModules', false);
            if (monitorCore) {
                await handleCoreModuleSave(document, coreModulesSidebar);
            }
        }
    }));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(async editor => {
        if (!editor) return;
        const classification = await getFileClassification();
        const filePath = editor.document.uri.fsPath;
        
        if (classification.coreModules.includes(filePath)) {
            coreModulesSidebar.updateForFile(editor.document);
        }
    }));
}

export function deactivate() {}

async function handleTestSuiteFileSave(document: vscode.TextDocument, sidebar: StatusViewProvider) {
    const content = document.getText();
    const isPyTest = content.includes('pytest') || /class\s+Test\w+/.test(content);
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const config = vscode.workspace.getConfiguration('cerberus');
    const activeHeads = config.get<string[]>('activeHeads', []);
    sidebar.updateStatus('running');
    let results: CheckResult[];
    if (isPyTest) {
        const promises = activeHeads.map(backend => runPyTest(backend, document.uri.fsPath, workspaceRoot));
        results = await Promise.all(promises);
    } else {
        const promises = activeHeads.map(backend => runCheck(backend, document.uri.fsPath));
        results = await Promise.all(promises);
    }
    const fails = results.filter(r => r.status === 'FAIL');
    const enableAgent = config.get<boolean>('enableAgentSummaries', true);
    if (enableAgent && fails.length > 0 && fails.length < activeHeads.length) {
        if (fails.length === 1) {
            const agentAnalysis = await runAgentAnalysis(
                fails[0].backend,
                workspaceRoot,
                fails[0].error || "",
                'single'
            );
            fails[0].aiInsight = agentAnalysis;
        } else if (fails.length === 2) {
            const combinedAnalysis = await runCombinedAgentAnalysis(fails, workspaceRoot);
            fails.forEach(f => f.aiInsight = combinedAnalysis);
        }
    } else if (fails.length === activeHeads.length && fails.length > 0) {
         fails.forEach(f => {
            f.aiInsight = "⚠️ All backends failed. The code is not recommended for Agent evaluation yet.";
        });
    }
    sidebar.updateView(results);
}

async function handleCoreModuleSave(document: vscode.TextDocument, sidebar: CoreModulesViewProvider) {
    vscode.window.showInformationMessage('Cerberus: Analyzing Core Module changes...');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const tips = await analyzeCompatibilityTips(document, workspaceRoot);
    sidebar.updateCompatibilityTips(tips);
}

async function generateCoreModuleSummary(document: vscode.TextDocument, sidebar: CoreModulesViewProvider) {
    vscode.window.showInformationMessage('Cerberus: Generating Core Module Summary...');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return;
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const content = document.getText();
    const summary = await generateSummaryWithAgent(content, workspaceRoot);
    sidebar.updateSummary(summary);
}

function runPyTest(backend: string, testFile: string, workspaceRoot: string): Promise<CheckResult> {
    return new Promise((resolve) => {
        const command = `pytest ${testFile} -v`;
        const options = {
            cwd: workspaceRoot,
            env: {
                ...process.env,
                KERAS_BACKEND: backend
            }
        };
        exec(command, options, (error, stdout, stderr) => {
            if (error) {
                resolve({ backend, status: 'FAIL', error: stderr || stdout });
            } else {
                resolve({ backend, status: 'PASS' });
            }
        });
    });
}

function runAgentAnalysis(backend: string, workspaceRoot: string, errorLog: string, mode: 'single' | 'combined'): Promise<string> {
    return new Promise((resolve) => {
        const agentScript = path.join(workspaceRoot, 'agent.py');
        const command = `python "${agentScript}" "${backend}" "${workspaceRoot}"`;
        const process = exec(command, (err, stdout, stderr) => {
            if (err) {
                resolve("Agent failed to analyze the error.");
            } else {
                resolve(stdout.trim());
            }
        });
        if (process.stdin) {
            process.stdin.write(errorLog);
            process.stdin.end();
        }
    });
}

async function runCombinedAgentAnalysis(failures: CheckResult[], workspaceRoot: string): Promise<string> {
    const agentScript = path.join(workspaceRoot, 'agent.py');
    const backends = failures.map(f => f.backend).join(',');
    const combinedErrors = failures.map(f => `[${f.backend}]\n${f.error}`).join('\n\n---\n\n');
    return new Promise((resolve) => {
        const command = `python "${agentScript}" "${backends}" "${workspaceRoot}"`;
        const process = exec(command, (err, stdout, stderr) => {
            if (err) {
                resolve("Agent failed to analyze the combined errors.");
            } else {
                resolve(stdout.trim());
            }
        });
        if (process.stdin) {
            process.stdin.write(combinedErrors);
            process.stdin.end();
        }
    });
}

async function analyzeCompatibilityTips(document: vscode.TextDocument, workspaceRoot: string): Promise<string[]> {
    const agentScript = path.join(workspaceRoot, 'agent.py');
    const content = document.getText();
    return new Promise((resolve) => {
        const command = `python "${agentScript}" "compatibility-check" "${workspaceRoot}"`;
        const process = exec(command, (err, stdout) => {
            if (err) {
                resolve(['Unable to generate compatibility tips.']);
            } else {
                const tips = stdout.trim().split('\n').filter(t => t.length > 0);
                resolve(tips.length > 0 ? tips : ['No compatibility issues detected.']);
            }
        });
        if (process.stdin) {
            process.stdin.write(content);
            process.stdin.end();
        }
    });
}

async function generateSummaryWithAgent(content: string, workspaceRoot: string): Promise<string> {
    const agentScript = path.join(workspaceRoot, 'agent.py');
    return new Promise((resolve) => {
        const command = `python "${agentScript}" "summarize" "${workspaceRoot}"`;
        const process = exec(command, (err, stdout) => {
            if (err) {
                resolve("Failed to generate summary.");
            } else {
                resolve(stdout.trim());
            }
        });
        if (process.stdin) {
            process.stdin.write(content);
            process.stdin.end();
        }
    });
}

async function getFileClassification(): Promise<FileClassification> {
    const config = vscode.workspace.getConfiguration('cerberus');
    return {
        testSuite: config.get<string[]>('testSuiteFiles', []),
        coreModules: config.get<string[]>('coreModuleFiles', [])
    };
}

async function addFileToClassification(filePath: string, category: 'testSuite' | 'coreModules') {
    const config = vscode.workspace.getConfiguration('cerberus');
    const classification = await getFileClassification();
    const otherCategory = category === 'testSuite' ? 'coreModules' : 'testSuite';
    const otherFiles = classification[otherCategory].filter(f => f !== filePath);
    const targetFiles = [...classification[category], filePath];
    await config.update(`${category}Files`, targetFiles, vscode.ConfigurationTarget.Workspace);
    await config.update(`${otherCategory}Files`, otherFiles, vscode.ConfigurationTarget.Workspace);
}

async function removeFileFromClassification(filePath: string) {
    const config = vscode.workspace.getConfiguration('cerberus');
    const classification = await getFileClassification();
    const testSuite = classification.testSuite.filter(f => f !== filePath);
    const coreModules = classification.coreModules.filter(f => f !== filePath);
    await config.update('testSuiteFiles', testSuite, vscode.ConfigurationTarget.Workspace);
    await config.update('coreModuleFiles', coreModules, vscode.ConfigurationTarget.Workspace);
}
