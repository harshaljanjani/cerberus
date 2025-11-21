import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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

    public refresh() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

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
            const uri = this._currentFile?.uri;
            switch (message.command) {
                case 'jumpToLine':
                    if (this._currentFile) {
                        const editor = await vscode.window.showTextDocument(this._currentFile);
                        const position = new vscode.Position(message.line, 0);
                        editor.selection = new vscode.Selection(position, position);
                        editor.revealRange(new vscode.Range(position, position));
                    }
                    break;
                case 'generateSummary':
                    if (uri) vscode.commands.executeCommand('cerberus.generateSummary', uri);
                    break;
                case 'summarizeEntity':
                    if (uri) vscode.commands.executeCommand('cerberus.summarizeEntity', message.name, message.type, uri);
                    break;
                case 'toggleMonitoring':
                    const config = vscode.workspace.getConfiguration('cerberus');
                    const current = config.get<boolean>('monitorCoreModules', false);
                    await config.update('monitorCoreModules', !current, vscode.ConfigurationTarget.Workspace);
                    this.refresh();
                    vscode.window.showInformationMessage(`Core Module monitoring ${!current ? 'enabled' : 'disabled'}.`);
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
            this._view.webview.postMessage({ command: 'updateGlobalSummary', html: renderMarkdown(summary) });
        }
    }

    public updateEntitySummary(name: string, summary: string) {
        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateEntitySummary',
                name: name,
                html: renderMarkdown(summary)
            });
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
        const cerberusBlue = '#007acc';
        const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'cerberus-icon.svg'));
        const config = vscode.workspace.getConfiguration('cerberus');
        const isMonitoring = config.get<boolean>('monitorCoreModules', false);
        const fileName = this._currentFile ? path.basename(this._currentFile.uri.fsPath) : 'No active file';
        const classesHtml = this._classes.length > 0
            ? this._classes.map(item => {
                const iconClass = item.type === 'class' ? 'icon-class' : 'icon-function';
                return `
                <div class="item-card" id="card-${item.name}">
                    <div class="item-header" data-name="${item.name}" data-type="${item.type}">
                        <span class="item-icon ${iconClass}" style="-webkit-mask-image: url('${logoUri}'); mask-image: url('${logoUri}');"></span>
                        <span class="item-name">${item.name}</span>
                        <span class="item-type">${item.type}</span>
                        <span class="item-action-icon" data-action="jump" data-line="${item.lineNumber}">↗</span>
                    </div>
                    <div class="item-summary" id="summary-${item.name}" style="display:none;"></div>
                </div>`;
            }).join('')
            : '<p class="empty-text">No classes or functions found in this file.</p>';
        const summaryHtml = `
            <div class="summary-section" id="global-summary-container" style="display: ${this._summary ? 'block' : 'none'};">
                 <div class="card agent-card">
                    <div class="card-header">
                        <span class="backend-name" style="color: var(--vscode-textLink-foreground);">Cerberus Insight</span>
                        <div class="icon-mask" style="-webkit-mask-image: url('${logoUri}'); mask-image: url('${logoUri}');"></div>
                    </div>
                    <div class="ai-content" id="global-summary-content">${this._summary ? renderMarkdown(this._summary) : ''}</div>
                </div>
            </div>`;
        const tipsHtml = this._compatibilityTips.length > 0
            ? `
            <div class="tips-section">
                <h3>
                    <span class="header-icon" style="-webkit-mask-image: url('${logoUri}'); mask-image: url('${logoUri}');"></span>
                    Compatibility Tips
                </h3>
                ${this._compatibilityTips.map(tip => `
                <div class="tip-card">
                    ${renderMarkdown(tip)} 
                </div>`).join('')}
            </div>`
            : '';
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Core Modules</title>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Google+Sans+Display:wght@400;600&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
                <style>
                    :root {
                        --keras-red: ${kerasRed};
                        --cerberus-blue: ${cerberusBlue};
                        --font-family-heading: 'Google Sans Display', var(--vscode-font-family);
                        --font-family-body: 'Roboto', var(--vscode-font-family);
                    }

                    body {
                        padding: 20px;
                        font-family: var(--font-family-body);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        margin: 0;
                        overflow-x: hidden;
                    }

                    h1 {
                        font-family: var(--font-family-heading);
                        font-size: 18px;
                        font-weight: 400;
                        margin: 0 0 4px 0;
                        letter-spacing: 0.5px;
                    }

                    h3 {
                        font-family: var(--font-family-heading);
                        font-size: 14px;
                        font-weight: 600;
                        margin: 20px 0 12px 0;
                        letter-spacing: 0.5px;
                        display: flex;
                        align-items: center;
                    }

                    .header-icon {
                        display: inline-block;
                        width: 16px;
                        height: 16px;
                        background-color: var(--vscode-foreground);
                        -webkit-mask-size: contain;
                        mask-size: contain;
                        -webkit-mask-repeat: no-repeat;
                        mask-repeat: no-repeat;
                        margin-right: 6px;
                    }

                    .current-file-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-bottom: 16px;
                        padding-bottom: 8px;
                        border-bottom: 1px solid var(--vscode-widget-border);
                    }

                    .file-name {
                        font-size: 13px;
                        font-weight: 500;
                        color: var(--vscode-descriptionForeground);
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
                        cursor: pointer;
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
                        margin-bottom: 8px;
                        overflow: hidden;
                    }

                    .item-header {
                        padding: 12px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        transition: background 0.2s;
                    }

                    .item-header:hover {
                        background: var(--vscode-list-hoverBackground);
                    }

                    .item-icon {
                        width: 16px;
                        height: 16px;
                        -webkit-mask-size: contain;
                        mask-size: contain;
                        -webkit-mask-repeat: no-repeat;
                        mask-repeat: no-repeat;
                    }

                    .item-icon.icon-class {
                        background-color: var(--keras-red);
                    }

                    .item-icon.icon-function {
                        background-color: var(--vscode-foreground);
                    }

                    .item-name {
                        flex: 1;
                        font-weight: 500;
                        font-size: 13px;
                        pointer-events: none;
                    }

                    .item-type {
                        font-size: 10px;
                        text-transform: uppercase;
                        color: var(--vscode-descriptionForeground);
                        background: var(--vscode-badge-background);
                        padding: 2px 6px;
                        border-radius: 3px;
                        pointer-events: none;
                    }

                    .item-action-icon {
                        font-size: 14px;
                        color: var(--vscode-textLink-foreground);
                        padding: 2px 6px;
                        border-radius: 3px;
                        cursor: pointer;
                    }

                    .item-action-icon:hover {
                        background: var(--vscode-button-secondaryBackground);
                    }

                    .item-summary {
                        padding: 12px;
                        border-top: 1px solid var(--vscode-widget-border);
                        background: rgba(0, 122, 204, 0.05);
                        font-size: 12px;
                        line-height: 1.5;
                    }

                    .loading-text {
                        font-style: italic;
                        color: var(--vscode-descriptionForeground);
                        display: flex;
                        align-items: center;
                        gap: 6px;
                    }

                    .card {
                        background-color: var(--vscode-sideBar-background);
                        border: 1px solid var(--vscode-widget-border);
                        border-radius: 8px;
                        padding: 12px;
                        margin-bottom: 12px;
                    }

                    .card.agent-card {
                        border-left: 4px solid var(--cerberus-blue);
                        background: rgba(0, 122, 204, 0.05);
                    }

                    .card-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 8px;
                    }

                    .icon-mask {
                        width: 16px;
                        height: 16px;
                        background-color: var(--keras-red);
                        -webkit-mask-size: contain;
                        mask-size: contain;
                        -webkit-mask-repeat: no-repeat;
                        mask-repeat: no-repeat;
                    }

                    .ai-content {
                        font-size: 12px;
                        line-height: 1.4;
                    }
                   
                    .tip-card {
                        background: rgba(100, 200, 255, 0.1);
                        border: 1px solid rgba(100, 200, 255, 0.3);
                        border-radius: 6px;
                        padding: 10px;
                        margin-bottom: 8px;
                        font-size: 12px;
                        line-height: 1.4;
                    }

                    p {
                        margin: 4px 0;
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
                <h1>Core Modules</h1>
                <div class="current-file-header"><span class="file-name">${fileName}</span></div>
                <div class="actions">
                    <button id="btn-generate-summary" class="btn">Generate Summary</button>
                    <button id="btn-toggle-monitoring" class="btn btn-secondary">${isMonitoring ? 'Disable Monitoring' : 'Enable Monitoring'}</button>
                </div>
                ${summaryHtml}
                <h3>Classes & Functions</h3>
                <div id="items-list" class="items-list">${classesHtml}</div>
                ${tipsHtml}
                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                   
                    document.getElementById('btn-generate-summary').addEventListener('click', () => {
                        document.getElementById('global-summary-container').style.display = 'block';
                        document.getElementById('global-summary-content').innerHTML = '<div class="loading-text">Analyzing module...</div>';
                        vscode.postMessage({ command: 'generateSummary' });
                    });

                    document.getElementById('btn-toggle-monitoring').addEventListener('click', () => {
                        vscode.postMessage({ command: 'toggleMonitoring' });
                    });

                    document.getElementById('items-list').addEventListener('click', (e) => {
                        const target = e.target;
                        if (target.classList.contains('item-action-icon')) {
                            e.stopPropagation();
                            const line = target.getAttribute('data-line');
                            vscode.postMessage({ command: 'jumpToLine', line: parseInt(line) });
                            return;
                        }
                        let header = target.closest('.item-header');
                        if (header) {
                            const name = header.getAttribute('data-name');
                            const type = header.getAttribute('data-type');
                            toggleEntitySummary(name, type);
                        }
                    });

                    function toggleEntitySummary(name, type) {
                        const container = document.getElementById('summary-' + name);
                        if (container.style.display === 'none') {
                            container.style.display = 'block';
                            if (!container.innerHTML || container.innerHTML.trim() === '') {
                                container.innerHTML = '<div class="loading-text"><span>Providing summary...</span></div>';
                                vscode.postMessage({ command: 'summarizeEntity', name: name, type: type });
                            }
                        } else {
                            container.style.display = 'none';
                        }
                    }

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'updateGlobalSummary':
                                document.getElementById('global-summary-content').innerHTML = message.html;
                                break;
                            case 'updateEntitySummary':
                                const container = document.getElementById('summary-' + message.name);
                                if (container) container.innerHTML = message.html;
                                break;
                        }
                    });
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
    let cleanText = text.replace(/^-\s*/, '');
    let escaped = escapeHtml(cleanText);
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    escaped = escaped.replace(/\n\n/g, '</p><p>');
    return `<p>${escaped}</p>`;
}
