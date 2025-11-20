import * as vscode from 'vscode';
import { StatusSidebar } from './StatusSidebar';
import { runCheck, CheckResult } from './backend-checker';
import * as path from 'path';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "cerberus" is now active!');
    const sidebarProvider = new StatusSidebar(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(StatusSidebar.viewType, sidebarProvider)
    );

    const runChecksCommand = vscode.commands.registerCommand('cerberus.runChecks', async () => {
        vscode.window.showInformationMessage('Cerberus: Running Backend Compatibility Checks');
        const config = vscode.workspace.getConfiguration('cerberus');
        const activeHeads = config.get<string[]>('activeHeads', []);
        const targetFileName = config.get<string>('targetFile', 'model.py');
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Cerberus requires an open workspace folder.');
            return;
        }
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const targetFile = path.join(workspaceRoot, targetFileName);
        sidebarProvider.updateStatus('running');
        try {
            const promises = activeHeads.map(backend => runCheck(backend, targetFile));
            const results = await Promise.all(promises);
            const passes = results.filter(r => r.status === 'PASS');
            const fails = results.filter(r => r.status === 'FAIL');
            if (passes.length > 0 && fails.length > 0) {
                vscode.window.showInformationMessage('Cerberus: Deploying Agent');
                const primaryFail = fails[0];
                const agentAnalysis = await runAgentAnalysis(
                    primaryFail.backend, 
                    workspaceRoot, 
                    primaryFail.error || ""
                );
                primaryFail.aiInsight = agentAnalysis;
            }

            sidebarProvider.updateView(results);
        } catch (e) {
            vscode.window.showErrorMessage(`An error occurred while running checks: ${e}`);
        }
    });

    context.subscriptions.push(runChecksCommand);
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
        const config = vscode.workspace.getConfiguration('cerberus');
        const targetFileName = config.get<string>('targetFile', 'model.py');
        if (path.basename(document.fileName) === targetFileName) {
            vscode.commands.executeCommand('cerberus.runChecks');
        }
    }));
}

export function deactivate() {}

function runAgentAnalysis(backend: string, workspaceRoot: string, errorLog: string): Promise<string> {
    return new Promise((resolve) => {
        const agentScript = path.join(workspaceRoot, 'agent.py'); 
        const command = `python "${agentScript}" "${backend}" "${workspaceRoot}"`;
        const process = exec(command, (err, stdout, stderr) => {
            if (stderr) {
                console.error(`[Agent stderr]:\n${stderr}`);
            }
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
