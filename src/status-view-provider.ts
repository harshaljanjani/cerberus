import * as vscode from 'vscode';
import * as fs from 'fs';
import { CheckResult } from './backend-runner';

export class StatusViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'cerberus.statusView';

    private _view?: vscode.WebviewView;
    private _results: CheckResult[] = [];
    private _wasRendered: boolean = false;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        this._wasRendered = false;
        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    }

    public updateView(results: CheckResult[]) {
        this._results = results;
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    public updateStatus(status: 'running' | 'idle') {
        if (this._view) {
            if (status === 'running') {
                this._view.webview.html = this._getHtmlForWebview(this._view.webview, true);
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview, running: boolean = false): string {
        const nonce = getNonce();
        const logoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'cerberus-icon.svg'));
        const config = vscode.workspace.getConfiguration('cerberus');
        const activeHeads = config.get<string[]>('activeHeads', []);
        let rawTestFiles = config.get<string[]>('testSuiteFiles', []);
        const validUniqueFiles = [...new Set(rawTestFiles.filter(f => fs.existsSync(f)))];
        if (validUniqueFiles.length !== rawTestFiles.length) {
            config.update('testSuiteFiles', validUniqueFiles, vscode.ConfigurationTarget.Workspace);
            rawTestFiles = validUniqueFiles; 
        }
        const kerasRed = '#D00000';
        const cerberusBlue = '#007acc';
        const shouldAnimate = !this._wasRendered;
        this._wasRendered = true;
        const animationClass = shouldAnimate ? 'slide-in' : '';
        const fileListHtml = rawTestFiles.length > 0 
            ? `<div class="file-list-container">
                 <div class="section-label">Target Test Suite</div>
                 ${rawTestFiles.map(f => `<div class="file-item" title="${f}"><span class="file-icon">📄</span> ${f.split(/[\\/]/).pop()}</div>`).join('')}
               </div>`
            : `<div class="file-list-container empty"><div class="section-label">Target Test Suite</div><div class="sub-text">No tests configured.</div></div>`;
        let content: string;
        let globalAgentHtml = '';
        if (running) {
            content = activeHeads.map((backend, index) => {
                const delayStyle = shouldAnimate ? `style="animation-delay: ${index * 0.1}s"` : '';
                return `
                <div class="card running ${animationClass}" ${delayStyle}>
                    <div class="card-header">
                        <span class="backend-name">${backend}</span>
                        <div class="spinner"></div>
                    </div>
                </div>`;
            }).join('');
        } else if (this._results.length > 0) {
            const failsWithInsight = this._results.filter(r => r.status === 'FAIL' && r.aiInsight);
            const uniqueInsights = [...new Set(failsWithInsight.map(r => r.aiInsight))];
            const hasGlobalInsight = failsWithInsight.length > 1 && uniqueInsights.length === 1;
            if (hasGlobalInsight) {
                globalAgentHtml = `
                <div class="card agent-card ${animationClass}">
                    <div class="card-header">
                        <span class="backend-name" style="color: var(--vscode-textLink-foreground);">Cerberus Insight</span>
                        <div class="icon icon-mask" style="-webkit-mask-image: url('${logoUri}'); mask-image: url('${logoUri}');"></div>
                    </div>
                    <div class="ai-content">${renderMarkdown(uniqueInsights[0]!)}</div>
                </div>`;
            }
            content = this._results.map((result, index) => {
                const statusIcon = result.status === 'PASS' 
                    ? `<span class="icon pass"><svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" fill="currentColor"/></svg></span>` 
                    : `<span class="icon fail"><svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" fill="currentColor"/></svg></span>`;
                const statusClass = result.status === 'PASS' ? 'pass' : 'fail';
                const delayStyle = shouldAnimate ? `style="animation-delay: ${index * 0.1}s"` : '';
                const aiSection = (!hasGlobalInsight && result.aiInsight && result.aiInsight.length > 0)
                    ? `<div class="ai-insight">
                        <div class="ai-label">Agent</div>
                        <div class="ai-content">${renderMarkdown(result.aiInsight)}</div>
                    </div>` 
                    : '';
                return `
                <div class="card ${statusClass} ${animationClass}" ${delayStyle}>
                    <div class="card-header">
                        <span class="backend-name">${result.backend}</span>
                        ${statusIcon}
                    </div>
                    ${aiSection} 
                    ${result.error ? `
                    <div class="error-container">
                        <div class="error-label">Error Log</div>
                        <div class="error-log">${renderErrorLog(result.error)}</div>
                    </div>` : ''}
                </div>`;
            }).join('');
        } else {
             const fadeClass = shouldAnimate ? 'fade-in' : '';
            content = `
                <div class="empty-state ${fadeClass}">
                    <div class="logo-placeholder">
                        <div class="logo-mask" style="-webkit-mask-image: url('${logoUri}'); mask-image: url('${logoUri}');"></div>
                    </div>
                    <p>Ready to verify your Keras model.</p>
                    <div class="sub-text" style="text-align:center;">
                        <div><strong>Active Backends</strong></div>
                        <div>${activeHeads.map(b => toTitleCase(b)).join(' | ')}</div>
                    </div>
                </div>`;
        }
        const headerClass = shouldAnimate ? 'animate-header' : '';
        const subtitleClass = shouldAnimate ? 'animate-subtitle' : '';
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'nonce-${nonce}';">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Cerberus</title>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Google+Sans+Display:wght@400;600&family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
                <style>
                     :root {
                        --keras-red: ${kerasRed};
                        --cerberus-blue: ${cerberusBlue};
                        --card-bg: var(--vscode-sideBar-background);
                        --card-border: var(--vscode-widget-border);
                        --card-hover: var(--vscode-list-hoverBackground);
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

                    .file-list-container {
                        margin-bottom: 20px;
                        background: rgba(0,0,0,0.05);
                        border-radius: 6px;
                        padding: 10px;
                    }
                    .section-label {
                        font-size: 10px;
                        font-weight: bold;
                        text-transform: uppercase;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 8px;
                        letter-spacing: 1px;
                    }
                    .file-item {
                        font-size: 12px;
                        padding: 4px 0;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        color: var(--vscode-foreground);
                    }
                    .file-icon { opacity: 0.7; }

                    /* Agents */
                    .ai-insight {
                        margin-top: 12px;
                        background: rgba(100, 200, 255, 0.1);
                        border: 1px solid rgba(100, 200, 255, 0.3);
                        border-radius: 6px;
                        padding: 8px;
                    }
                    .ai-label {
                        font-size: 11px;
                        font-weight: bold;
                        color: var(--vscode-textLink-foreground);
                        margin-bottom: 4px;
                    }
                    .ai-content {
                        font-size: 12px;
                        line-height: 1.4;
                    }

                    /* Animations */
                    @keyframes slideIn {
                        from { opacity: 0; transform: translateY(15px); }
                        to { opacity: 1; transform: translateY(0); }
                    }

                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }

                    /* Helper classes for one-time animations */
                    .animate-header { animation: slideIn 0.4s ease-out forwards; }
                    .animate-subtitle { opacity: 0; animation: slideIn 0.4s ease-out 0.1s forwards; }
                    
                    .slide-in {
                        opacity: 0; /* Start hidden only if animating */
                        animation: slideIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
                    }
                    
                    .fade-in {
                        opacity: 0;
                        animation: slideIn 0.6s ease-out forwards;
                    }

                    h1 {
                        font-size: 18px;
                        font-family: var(--font-family-heading);
                        font-weight: 400;
                        margin: 0 0 4px 0;
                        letter-spacing: 0.5px;
                    }

                    .subtitle {
                        font-size: 12px;
                        font-weight: 400;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 24px;
                        display: block;
                    }

                    /* Card Styles */
                    .card {
                        background-color: var(--card-bg);
                        border: 1px solid var(--card-border);
                        border-radius: 8px;
                        padding: 12px;
                        margin-bottom: 12px;
                        transition: transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
                        position: relative;
                        overflow: hidden;
                    }

                    .card:hover {
                        border-color: var(--keras-red);
                        background-color: var(--card-hover);
                        transform: translateY(-2px);
                    }

                    .card.fail {
                        border-left: 4px solid var(--keras-red);
                    }

                    .card.pass {
                        border-left: 4px solid var(--vscode-testing-iconPassed);
                    }

                    /* Global Agent Card */
                    .card.agent-card {
                        border-left: 4px solid var(--cerberus-blue);
                        background: rgba(0, 122, 204, 0.05);
                    }
                    .card.agent-card:hover {
                         border-color: var(--cerberus-blue);
                    }

                    .card-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }

                    .backend-name {
                        font-weight: 600;
                        font-size: 14px;
                        font-family: var(--font-family-body);
                        text-transform: capitalize;
                    }

                    /* Icons */
                    .icon {
                        width: 16px;
                        height: 16px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }

                    .icon-mask {
                        background-color: var(--keras-red);
                        -webkit-mask-size: contain;
                        mask-size: contain;
                        -webkit-mask-repeat: no-repeat;
                        mask-repeat: no-repeat;
                        -webkit-mask-position: center;
                        mask-position: center;
                    }
                    
                    .icon.pass { color: var(--vscode-testing-iconPassed); }
                    .icon.fail { color: var(--keras-red); }

                    /* Error Log */
                    .error-container {
                        margin-top: 12px;
                        padding-top: 12px;
                        border-top: 1px solid var(--vscode-widget-border);
                        animation: fadeIn 0.3s ease-in;
                    }

                    .error-label {
                        font-size: 10px;
                        text-transform: uppercase;
                        color: var(--keras-red);
                        margin-bottom: 4px;
                        font-weight: bold;
                    }

                    .error-log {
                        font-family: 'Courier New', Courier, monospace;
                        font-size: 11px;
                        background-color: var(--vscode-textBlockQuote-background);
                        padding: 8px;
                        border-radius: 4px;
                        overflow-x: auto;
                        margin: 0;
                        color: var(--vscode-textBlockQuote-foreground);
                    }

                    .error-log pre {
                        white-space: pre-wrap;
                        word-wrap: break-word;
                    }

                    /* Loading Spinner */
                    .spinner {
                        width: 16px;
                        height: 16px;
                        border: 2px solid var(--vscode-widget-border);
                        border-top-color: var(--keras-red);
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }

                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }

                    /* Empty State */
                    .empty-state {
                        text-align: center;
                        color: var(--vscode-descriptionForeground);
                        margin-top: 40px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                    }
                    
                    .logo-placeholder {
                        margin-bottom: 16px;
                        opacity: 1;
                        transition: transform 0.3s ease;
                    }

                    /* Masking For Red Color */
                    .logo-mask {
                        width: 64px;
                        height: 64px;
                        background-color: var(--keras-red);
                        -webkit-mask-repeat: no-repeat;
                        mask-repeat: no-repeat;
                        -webkit-mask-position: center;
                        mask-position: center;
                        -webkit-mask-size: contain;
                        mask-size: contain;
                    }

                    .empty-state:hover .logo-placeholder {
                        transform: scale(1.05) rotate(5deg);
                    }
                    
                    .sub-text {
                        font-size: 11px;
                        opacity: 0.7;
                    }
                </style>
            </head>
            <body>
                <header>
                    <h1 class="${headerClass}">Backend Status</h1>
                    <span class="subtitle ${subtitleClass}">Multi-Backend Compatibility</span>
                </header>

                ${fileListHtml}

                <div id="status-container">
                    ${globalAgentHtml}
                    ${content}
                </div>
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
    let escapedText = escapeHtml(text);
    escapedText = escapedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    escapedText = escapedText.replace(/`([^`]+)`/g, '<code>$1</code>');
    escapedText = escapedText.replace(/(<strong>Diagnosis:<\/strong>)/g, '<p>$1');
    escapedText = escapedText.replace(/(<strong>Fix:<\/strong>)/g, '<p>$1');
    return `<p>${escapedText}</p>`;
}

function renderErrorLog(log: string): string {
    let cleanLog = log.replace(/\uFFFD/g, '');
    cleanLog = cleanLog.replace(/\x1b\[1m/g, '<strong>').replace(/\x1b\[0m/g, '</strong>');
    cleanLog = cleanLog.replace(/\[1m/g, '<strong>').replace(/\[0m/g, '</strong>');
    const lines = escapeHtml(cleanLog).split('\n');
    const formattedLines = lines.map(line => {
        line = line.replace(/(File &quot;)(.*?)(&quot;, line )(\d+)/g, 
            '$1<span style="color: var(--vscode-textLink-foreground); text-decoration: underline;">$2</span>$3<strong style="color: var(--vscode-editorWarning-foreground);">$4</strong>');
        if (line.match(/^[a-zA-Z]+Error:/)) {
            return `<strong style="color: var(--keras-red);">${line}</strong>`;
        }
        if (line.startsWith('WARNING:')) {
            return `<span style="color: var(--vscode-editorWarning-foreground);">${line}</span>`;
        }
        if (line.includes('Arguments received by')) {
            return `<hr style="border-color: var(--vscode-widget-border); margin: 8px 0;" />${line}`;
        }
        return line;
    });
    return `<pre>${formattedLines.join('\n')}</pre>`;
}

function toTitleCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
