import * as vscode from 'vscode';
import * as path from 'path';

interface ClassInfo {
    name: string;
    lineNumber: number;
    type: 'class' | 'function';
}

export class CoreModulesViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'cerberus.coreModulesView';

    private _view?: vscode.WebviewView;
    private _currentFile?: vscode.TextDocument;
    private _classes: ClassInfo[] = [];
    private _summary?: string;
    private _compatibilityTips: string[] = [];

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'jumpToLine':
                    if (this._currentFile) {
                        const editor = await vscode.window.showTextDocument(this._currentFile);
                        const position = new vscode.Position(message.line, 0);
                        editor.selection = new vscode.Selection(position, position);
                        editor.revealRange(new vscode.Range(position, position));
                    }
                    break;
            }
        });
    }

    public updateForFile(document: vscode.TextDocument) {
        this._currentFile = document;
        this._classes = this._extractClassesAndFunctions(document);
        this._summary = undefined;
        this._compatibilityTips = [];
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    public updateSummary(summary: string) {
        this._summary = summary;
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    public updateCompatibilityTips(tips: string[]) {
        this._compatibilityTips = tips;
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    private _extractClassesAndFunctions(document: vscode.TextDocument): ClassInfo[] {
        const content = document.getText();
        const lines = content.split('\n');
        const items: ClassInfo[] = [];
        lines.forEach((line, idx) => {
            const classMatch = line.match(/^class\s+(\w+)/);
            if (classMatch) {
                items.push({
                    name: classMatch[1],
                    lineNumber: idx,
                    type: 'class'
                });
            }
            const funcMatch = line.match(/^def\s+(\w+)/);
            if (funcMatch) {
                items.push({
                    name: funcMatch[1],
                    lineNumber: idx,
                    type: 'function'
                });
            }
        });
        return items;
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();
        const kerasRed = '#D00000';
        const fileName = this._currentFile ? path.basename(this._currentFile.uri.fsPath) : 'No file selected';
        const classesHtml = this._classes.length > 0 
            ? this._classes.map(item => {
                const icon = item.type === 'class' ? '📦' : '⚙️';
                return `
                <div class="item-card" onclick="jumpToLine(${item.lineNumber})">
                    <span class="item-icon">${icon}</span>
                    <span class="item-name">${item.name}</span>
                    <span class="item-type">${item.type}</span>
                </div>`;
            }).join('')
            : '<p class="empty-text">No classes or functions found in this file.</p>';
        const summaryHtml = this._summary 
            ? `
            <div class="summary-section">
                <h3>📝 Generated Summary</h3>
                <div class="summary-content">${renderMarkdown(this._summary)}</div>
            </div>`
            : '';
        const tipsHtml = this._compatibilityTips.length > 0
            ? `
            <div class="tips-section">
                <h3>💡 Compatibility Tips</h3>
                ${this._compatibilityTips.map(tip => `
                <div class="tip-card">
                    ${escapeHtml(tip)}
                </div>`).join('')}
            </div>`
            : '';
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Core Modules</title>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Google+Sans+Display:wght@400;600&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
                <style>
                    :root {
                        --keras-red: ${kerasRed};
                        --font-family-heading: 'Google Sans Display', var(--vscode-font-family);
                        --font-family-body: 'Roboto', var(--vscode-font-family);
                    }
                    
                    body {
                        padding: 20px;
                        font-family: var(--font-family-body);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        margin: 0;
                    }

                    h1 {
                        font-family: var(--font-family-heading);
                        font-size: 18px;
                        font-weight: 400;
                        letter-spacing: 0.5px;
                        margin: 0 0 8px 0;
                    }

                    h3 {
                        font-family: var(--font-family-heading);
                        font-size: 14px;
                        font-weight: 600;
                        margin: 20px 0 12px 0;
                        color: var(--vscode-foreground);
                    }

                    .file-name {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 20px;
                        display: block;
                        font-family: var(--font-family-body);
                    }

                    .actions {
                        margin: 16px 0;
                        display: flex;
                        gap: 8px;
                        flex-wrap: wrap;
                    }

                    .btn {
                        background-color: var(--keras-red);
                        color: #fff;
                        border: none;
                        padding: 8px 16px;
                        border-radius: 4px;
                        font-size: 12px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: opacity 0.2s;
                        font-family: var(--font-family-body);
                    }

                    .btn:hover {
                        opacity: 0.9;
                    }

                    .btn-secondary {
                        background-color: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }

                    .item-card {
                        background-color: var(--vscode-sideBar-background);
                        border: 1px solid var(--vscode-widget-border);
                        border-radius: 6px;
                        padding: 12px;
                        margin-bottom: 8px;
                        cursor: pointer;
                        transition: all 0.2s;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    }

                    .item-card:hover {
                        border-color: var(--keras-red);
                        transform: translateX(4px);
                    }

                    .item-icon {
                        font-size: 16px;
                    }

                    .item-name {
                        flex: 1;
                        font-weight: 500;
                        font-size: 13px;
                    }

                    .item-type {
                        font-size: 10px;
                        text-transform: uppercase;
                        color: var(--vscode-descriptionForeground);
                        background: var(--vscode-badge-background);
                        padding: 2px 6px;
                        border-radius: 3px;
                    }

                    .summary-section, .tips-section {
                        margin-top: 24px;
                        padding-top: 16px;
                        border-top: 1px solid var(--vscode-widget-border);
                    }

                    .summary-content {
                        background-color: var(--vscode-textBlockQuote-background);
                        border-left: 3px solid var(--keras-red);
                        padding: 12px;
                        border-radius: 4px;
                        font-size: 12px;
                        line-height: 1.6;
                    }

                    .tip-card {
                        background-color: rgba(100, 200, 255, 0.1);
                        border: 1px solid rgba(100, 200, 255, 0.3);
                        border-radius: 6px;
                        padding: 10px;
                        margin-bottom: 8px;
                        font-size: 12px;
                        line-height: 1.5;
                    }

                    .empty-text {
                        color: var(--vscode-descriptionForeground);
                        font-size: 12px;
                        text-align: center;
                        padding: 20px;
                    }

                    code {
                        background: var(--vscode-textCodeBlock-background);
                        padding: 2px 4px;
                        border-radius: 3px;
                        font-family: 'Courier New', monospace;
                        font-size: 11px;
                    }

                    strong {
                        color: var(--vscode-textLink-foreground);
                    }
                </style>
            </head>
            <body>
                <h1>Core Modules View</h1>
                <span class="file-name">${fileName}</span>

                <div class="actions">
                    <button class="btn" onclick="generateSummary()">Generate Summary</button>
                    <button class="btn btn-secondary" onclick="toggleMonitoring()">Toggle Monitoring</button>
                </div>

                <h3>Classes & Functions</h3>
                <div class="items-list">
                    ${classesHtml}
                </div>

                ${summaryHtml}
                ${tipsHtml}

                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();

                    function jumpToLine(line) {
                        vscode.postMessage({
                            command: 'jumpToLine',
                            line: line
                        });
                    }

                    function generateSummary() {
                        vscode.postMessage({
                            command: 'generateSummary'
                        });
                    }

                    function toggleMonitoring() {
                        vscode.postMessage({
                            command: 'toggleMonitoring'
                        });
                    }
                </script>
            </body>
            </html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderMarkdown(text: string): string {
    let escaped = escapeHtml(text);
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    escaped = escaped.replace(/\n\n/g, '</p><p>');
    return `<p>${escaped}</p>`;
}
