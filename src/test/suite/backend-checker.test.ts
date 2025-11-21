import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { runCheck } from '../../backend-runner';

suite('Backend Checker Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');
    test('runCheck should return PASS for a successful command', async () => {
        if (!vscode.workspace.workspaceFolders) {
            assert.fail('Test requires an open folder in the workspace.');
        }
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const modelPyPath = path.join(workspaceRoot, 'model.py');
        const result = await runCheck('tensorflow', modelPyPath);
        assert.strictEqual(result.status, 'PASS');
    });
    test('runCheck should return FAIL for a failing command', async () => {
        if (!vscode.workspace.workspaceFolders) {
            assert.fail('Test requires an open folder in the workspace.');
        }
        const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const failingModelPyPath = path.join(workspaceRoot, 'failing_model.py');
        const result = await runCheck('tensorflow', failingModelPyPath);
        assert.strictEqual(result.status, 'FAIL');
    });
});
