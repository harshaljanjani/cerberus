import * as vscode from 'vscode';
import { exec } from 'child_process';

export interface CheckResult {
    backend: string;
    status: 'PASS' | 'FAIL';
    error?: string;
    aiInsight?: string;
}

export function runCheck(backend: string, targetFile: string): Promise<CheckResult> {
    return new Promise((resolve) => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            resolve({ backend, status: 'FAIL', error: 'No workspace folder open.' });
            return;
        }
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        const command = `python ${targetFile} --dry-run`;
        const options = {
            cwd: workspaceRoot,
            env: {
                ...process.env,
                KERAS_BACKEND: backend
            }
        };
        exec(command, options, (error, stdout, stderr) => {
            if (error) {
                resolve({ backend, status: 'FAIL', error: stderr });
            } else {
                resolve({ backend, status: 'PASS' });
            }
        });
    });
}
