// ==UserScript==
// @name         UIFactory (OOP Components)
// @namespace    https://github.com/P0NT4S/
// @version      7.0.2
// @description  Biblioteca UI e Design System estruturada em Classes ES6+.
// @author       P0nt4s
// ==/UserScript==

// ==========================================================================
// 1. THEME MANAGER
// ==========================================================================
class ThemeManager {
    static STORAGE_KEY = 'pts_theme_pref';

    static init() {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
    }

    static toggle() {
        const html = document.documentElement;
        const isLight = html.getAttribute('data-theme') === 'light';
        
        if (isLight) {
            html.removeAttribute('data-theme');
            localStorage.setItem(this.STORAGE_KEY, 'dark');
            return 'dark';
        } else {
            html.setAttribute('data-theme', 'light');
            localStorage.setItem(this.STORAGE_KEY, 'light');
            return 'light';
        }
    }
}

// ==========================================================================
// 2. CLASSES BASE (Abstrações do Diagrama)
// ==========================================================================

class UIBase {
    constructor(core, parent = document.body, customClasses = '', tag = 'div') {
        this.core = core;
        this.parent = parent;
        this.customClasses = customClasses;
        
        this.el = document.createElement(tag);
        if (this.customClasses) this._addClass(this.customClasses);
    }

    mount(target = null) {
        const dest = target || this.parent;
        if (dest && this.el) dest.appendChild(this.el);
        return this;
    }

    destroy() {
        if (this.el && this.el.parentNode) {
            this.el.parentNode.removeChild(this.el);
        }
        this.el = null;
    }

    getNode() { return this.el; }

    _addClass(className) {
        if (this.el && className) {
            className.split(' ').forEach(c => c.trim() && this.el.classList.add(c.trim()));
        }
    }
}

class SemanticBase extends UIBase {
    static ALLOWED_VARIANTS = ["success", "error", "warning", "info", "primary"];

    constructor(core, parent, customClasses, tag, baseClass, variant = "primary") {
        super(core, parent, customClasses, tag);
        this.baseClass = baseClass;
        this.variant = this._getSafeVariant(variant);
        
        this._addClass(this.baseClass);
        this._applyVariantClass();
    }

    _getSafeVariant(variant) {
        return SemanticBase.ALLOWED_VARIANTS.includes(variant) ? variant : "primary";
    }

    _applyVariantClass() {
        SemanticBase.ALLOWED_VARIANTS.forEach(v => this.el.classList.remove(`${this.baseClass}--${v}`));
        this._addClass(`${this.baseClass}--${this.variant}`);
    }

    setVariant(newVariant) {
        this.variant = this._getSafeVariant(newVariant);
        this._applyVariantClass();
        return this;
    }
}

class SemanticTextBase extends SemanticBase {
    constructor(core, parent, customClasses, tag, baseClass, variant, text = "") {
        super(core, parent, customClasses, tag, baseClass, variant);
        this.text = text;
        this.setText(this.text);
    }

    setText(text) {
        this.text = text;
        this.el.innerHTML = this.text; // Permite ícones/emojis junto com texto
    }
}

class ContainerBase extends UIBase {
    constructor(core, parent, customClasses, isCompact = false, hasCloseButton = false) {
        super(core, parent, customClasses, 'div');
        this.isCompact = isCompact;
        this.hasCloseButton = hasCloseButton;
        
        this.titleNode = document.createElement('div');
        this.bodyNode = document.createElement('div');
        
        this.setCompact(this.isCompact);
    }

    setCompact(state) {
        this.isCompact = state;
        if (state) this._addClass('pts-panel--compact'); // Fallback pra CSS existente
        else this.el.classList.remove('pts-panel--compact');
    }

    setContent(content) {
        this.bodyNode.innerHTML = '';
        if (typeof content === 'string') this.bodyNode.innerHTML = content;
        else if (content instanceof HTMLElement) this.bodyNode.appendChild(content);
        else if (content instanceof UIBase) this.bodyNode.appendChild(content.getNode());
    }

    setTitle(text) {
        this.titleNode.innerText = text;
    }
}

class DataDisplayBase extends UIBase {
    constructor(core, parent, customClasses, tag = 'div', initialData = []) {
        super(core, parent, customClasses, tag);
        this.data = initialData;
    }

    updateData(newData) {
        this.data = newData;
        if (typeof this.render === 'function') this.render();
    }

    clear() { this.updateData([]); }
    getData() { return this.data; }
    lenData() { return Array.isArray(this.data) ? this.data.length : Object.keys(this.data).length; }
    
    orderBy(field, direction = 'asc') {
        if (Array.isArray(this.data)) {
            this.data.sort((a, b) => {
                if (a[field] < b[field]) return direction === 'asc' ? -1 : 1;
                if (a[field] > b[field]) return direction === 'asc' ? 1 : -1;
                return 0;
            });
            if (typeof this.render === 'function') this.render();
        }
    }
}

class FormBase extends UIBase {
    constructor(core, parent, customClasses, initialValue = "", isDisabled = false) {
        super(core, parent, customClasses, 'div');
        this.value = initialValue;
        this.isDisabled = isDisabled;
    }

    getValue() { return this.value; }
    setValue(val) { 
        this.value = val; 
        this._syncUI(); 
    }
    
    setDisabled(state) {
        this.isDisabled = state;
        this._syncUI();
    }

    _syncUI() {
        // A ser implementado pelas classes filhas (ex: Input)
    }
}

class ButtonBase extends SemanticBase {
    constructor(core, parent, customClasses, baseClass, variant, onClick, isDisabled = false, hoverText = "") {
        super(core, parent, customClasses, 'button', baseClass, variant);
        this.onClick = onClick;
        this.isDisabled = isDisabled;
        this.hoverText = hoverText;

        if (this.hoverText) this.el.title = this.hoverText;
        this.el.addEventListener('click', (e) => this._handleClick(e));
        if (this.isDisabled) this.disable();
    }

    _handleClick(event) {
        event.preventDefault();
        if (!this.isDisabled && typeof this.onClick === 'function') this.onClick(event);
    }

    disable() {
        this.isDisabled = true;
        this.el.disabled = true;
        this._addClass('pts-btn--disabled'); // Certifique-se de ter essa classe no CSS
    }

    enable() {
        this.isDisabled = false;
        this.el.disabled = false;
        this.el.classList.remove('pts-btn--disabled');
    }
}

// ==========================================================================
// 3. COMPONENTES CONCRETOS (Folhas)
// ==========================================================================

class Badge extends SemanticTextBase {
    constructor(core, parent, text, variant = "primary", appearance = "fill") {
        super(core, parent, 'pts-badge', 'span', 'variant', variant, text);
        this.appearance = appearance; // fill, outline, ghost
        this.setAppearance(this.appearance);
    }

    setAppearance(type) {
        this.el.classList.remove('pts-badge--fill', 'pts-badge--outline', 'pts-badge--ghost');
        this.appearance = ["fill", "outline", "ghost"].includes(type) ? type : "fill";
        this._addClass(`pts-badge--${this.appearance}`);
    }
}

class Toast extends SemanticTextBase {
    static _getContainer() {
        let container = document.querySelector('.pts-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'pts-toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    constructor(core, text, variant = "primary", duration = 4000) {
        // Toasts são montados no container global
        super(core, Toast._getContainer(), 'pts-toast', 'div', 'pts-toast', variant, text);
        this.duration = duration;
        
        const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️', primary: '🟣' };
        this.setText(`<span>${icons[this.variant]||'•'}</span><span>${this.text}</span>`);
        
        this.el.style.cursor = 'pointer';
        this.el.onclick = () => this.hide();
    }

    show() {
        this.mount();
        if (this.duration > 0) {
            setTimeout(() => this.hide(), this.duration);
        }
    }

    hide() {
        this.el.classList.add('pts-toast-out');
        this.el.addEventListener('transitionend', () => this.destroy());
    }
}

class StatusBox extends SemanticTextBase {
    constructor(core, parent, text, variant = "info") {
        super(core, parent, 'pts-status-box', 'div', 'pts-status-box', variant, text);
    }
}

class Button extends ButtonBase {
    constructor(core, parent, text, variant = "primary", onClick, isDisabled = false) {
        super(core, parent, 'pts-btn', 'pts-btn', variant, onClick, isDisabled);
        this.text = text;
        this.setText(this.text);
    }

    setText(text) {
        this.text = text;
        this.el.innerText = this.text;
    }
}

class IconButton extends ButtonBase {
    constructor(core, parent, icon, onClick, hoverText = "", isInline = false) {
        super(core, parent, 'pts-btn-icon pts-hover-scale', 'pts-btn-icon', 'primary', onClick, false, hoverText);
        this.isInline = isInline;
        if (this.isInline) this._addClass('pts-btn-inline');
        this.setIcon(icon);
    }

    setIcon(icon) {
        this.icon = icon;
        this.el.innerHTML = this.icon;
    }
}

class FabButton extends ButtonBase {
    constructor(core, icon, onClick, hoverText = "Ação") {
        super(core, document.body, 'pts-btn-fab', 'pts-btn-fab', 'primary', onClick, false, hoverText);
        this.setIcon(icon);
        this._calculateOffset();
    }

    setIcon(icon) {
        this.icon = icon;
        this.el.innerHTML = this.icon;
    }

    _calculateOffset() {
        const existing = document.querySelectorAll('.pts-btn-fab');
        this.offsetPosition = 20 + (existing.length * 60);
        this.el.style.bottom = `${this.offsetPosition}px`;
    }
}

class Card extends ContainerBase {
    constructor(core, parent, config = {}) {
        super(core, parent, 'pts-card', false, config.closeButton || false);
        this.variant = config.variant || "primary";
        
        // Simulação de composição com SemanticBase (Borda Colorida)
        this._addClass(`pts-card--${this.variant}`);
        
        this.titleNode.className = 'pts-card-header';
        if (config.title) this.setTitle(`<span class="pts-card-title">${config.title}</span>`);
        
        if (this.hasCloseButton) {
            const btn = document.createElement('button');
            btn.className = 'pts-close-btn';
            btn.innerHTML = '&times;';
            btn.onclick = () => { this.destroy(); if(config.onClose) config.onClose(); };
            this.titleNode.appendChild(btn);
        }

        this.el.appendChild(this.titleNode);
        this.el.appendChild(this.bodyNode);
        
        if (config.content) this.setContent(config.content);
    }

    setVariant(newVariant) {
        this.el.classList.remove(`pts-card--${this.variant}`);
        this.variant = ["success", "error", "warning", "info", "primary"].includes(newVariant) ? newVariant : "primary";
        this._addClass(`pts-card--${this.variant}`);
    }
    
    getVariant() { return this.variant; }
    
    // Sobrescreve para injetar HTML diretamente se formatado
    setTitle(html) { this.titleNode.innerHTML = html; }
}

class Panel extends ContainerBase {
    constructor(core, config = {}) {
        super(core, document.body, 'pts-panel', config.compact || false, config.closeButton ?? true);
        this.isDraggable = config.draggable ?? true;
        this.isPersist = config.persist ?? false;
        this.position = config.pos || null;

        this.el.id = config.id || `panel-${Date.now()}`;
        
        this.titleNode.className = 'pts-panel-header';
        this.bodyNode.className = 'pts-panel-body';

        if (config.title) {
            const tSpan = document.createElement('span');
            tSpan.className = 'pts-panel-title';
            tSpan.innerText = config.title;
            this.titleNode.appendChild(tSpan);
        }

        if (this.hasCloseButton) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'pts-close-btn';
            closeBtn.innerHTML = '&times;';
            closeBtn.onclick = () => this.hide();
            this.titleNode.appendChild(closeBtn);
        }

        this.el.appendChild(this.titleNode);
        this.el.appendChild(this.bodyNode);

        if (config.content) this.setContent(config.content);
        if (this.isDraggable) this._makeDraggable();
        if (this.position) this.setPosition(this.position.x, this.position.y);
        
        // Inicia invisível
        this.el.style.display = 'none';
    }

    _makeDraggable() {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        this.titleNode.style.cursor = 'move';
        
        this.titleNode.onmousedown = (e) => {
            if (e.target.closest('.pts-close-btn')) return;
            e.preventDefault();
            pos3 = e.clientX; pos4 = e.clientY;
            
            // Fixa as coordenadas exatas e desliga âncoras CSS antes de começar a mover.
            // Impede que o navegador tente "espremer" o painel ao chegar na borda.
            const rect = this.el.getBoundingClientRect();
            this.el.style.right = 'auto'; 
            this.el.style.bottom = 'auto';
            this.el.style.transform = 'none'; 
            this.el.style.margin = '0';
            this.el.style.left = rect.left + 'px'; 
            this.el.style.top = rect.top + 'px';
            
            document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
            
            document.onmousemove = (e) => {
                e.preventDefault();
                pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
                pos3 = e.clientX; pos4 = e.clientY;
                
                let newTop = this.el.offsetTop - pos2;
                let newLeft = this.el.offsetLeft - pos1;
                
                // Impede que o cabeçalho suma pelo fundo, mas deixa o corpo vazar
                newTop = Math.max(0, Math.min(newTop, window.innerHeight - this.titleNode.offsetHeight));
                
                // Trava no lado esquerdo (0), e na direita permite que 50% do painel saia da tela
                newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - (this.el.offsetWidth * 0.5)));
                
                this.el.style.top = newTop + "px";
                this.el.style.left = newLeft + "px";
            };
        };
    }

    show() {
        this.el.style.display = 'flex';
        this.el.style.opacity = '1';
    }

    hide() {
        if (this.isPersist) this.el.style.display = 'none';
        else this.destroy();
    }

    setPosition(x, y) {
        this.position = { x, y };
        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
        this.el.style.transform = 'none';
    }

    getPosition() { return this.position; }
}

// --- Componentes baseados em Template HTML Injetado ---

class Table extends DataDisplayBase {
    constructor(core, parent, headers = [], initialRows = [], isCompact = false) {
        super(core, parent, 'pts-table-container', 'div', initialRows);
        this.headers = headers;
        this.isCompact = isCompact;
        this.render();
    }

    renderEmptyState(message) {
        return `<div style="text-align: center; padding: 16px; color: var(--th-text-muted); font-size: 13px;">${message}</div>`;
    }

    render() {
        if (!this.headers.length && !this.data.length) {
            this.el.innerHTML = this.renderEmptyState("Sem dados para exibir.");
            return;
        }

        const tableClass = this.isCompact ? 'pts-table pts-table--compact' : 'pts-table';
        const thead = this.headers.length ? `<thead><tr>${this.headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>` : '';
        const colspan = Math.max(this.headers.length, 1);
        
        const tbody = `<tbody>${
            this.data.length > 0
                ? this.data.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')
                : `<tr><td colspan="${colspan}">${this.renderEmptyState("Nenhum registro encontrado.")}</td></tr>`
        }</tbody>`;

        this.el.innerHTML = `<table class="${tableClass}">${thead}${tbody}</table>`;
    }
}

class KeyValue extends DataDisplayBase {
    constructor(core, parent, objData = {}) {
        super(core, parent, 'pts-group', 'div', objData);
        this.render();
    }

    getKeys() { return Object.keys(this.data); }
    getValues() { return Object.values(this.data); }

    render() {
        this.el.innerHTML = Object.entries(this.data).map(([label, val]) => `
            <div style="margin-bottom: 4px;">
                <span class="pts-kv-label">${label}:</span>
                <span class="pts-kv-value">${val}</span>
            </div>
        `).join('');
    }
}

class List extends DataDisplayBase {
    constructor(core, parent, items = [], isOrdered = false) {
        super(core, parent, '', 'div', items);
        this.isOrdered = isOrdered;
        this.render();
    }

    render() {
        if (!this.data || this.data.length === 0) {
            this.el.innerHTML = '';
            return;
        }
        const tag = this.isOrdered ? 'ol' : 'ul';
        const lis = this.data.map(item => `<li style="margin-bottom: 4px;">${item}</li>`).join('');
        this.el.innerHTML = `<${tag} style="margin: 0; padding-left: 20px; font-size: 13px; color: var(--th-text);">${lis}</${tag}>`;
    }
}

class Input extends FormBase {
    constructor(core, parent, label, placeholder = "", type = "text", initialValue = "") {
        super(core, parent, 'pts-group', initialValue);
        this.label = label;
        this.placeholder = placeholder;
        this.type = type;
        
        this.render();
    }

    render() {
        this.el.innerHTML = `
            <label class="pts-label">${this.label}</label>
            <input type="${this.type}" class="pts-input" placeholder="${this.placeholder}" value="${this.value}">
        `;
        
        // Atrela o binding bi-direcional
        const inputNode = this.el.querySelector('input');
        inputNode.addEventListener('input', (e) => {
            this.value = e.target.value;
        });
        
        this._syncUI();
    }

    _syncUI() {
        const inputNode = this.el.querySelector('input');
        if (inputNode) {
            inputNode.value = this.value;
            inputNode.disabled = this.isDisabled;
        }
    }
}

class Divider extends UIBase {
    constructor(core, parent, title = "", style = "dashed") {
        super(core, parent, '', 'div');
        this.style = style; // dashed, solid, dotted, none
        this.setTitle(title);
    }

    setTitle(title) {
        this.title = title;
        const titleHtml = this.title ? `<div style="font-weight: 600; color: var(--th-primary-light); margin-bottom: 4px;">${this.title}</div>` : '';
        const borderCss = this.style === "none" ? "border: none;" : `border-top: 1px ${this.style} rgba(255,255,255,0.1);`;
        
        this.el.style.cssText = `${borderCss} margin-top: 8px; padding-top: 8px;`;
        this.el.innerHTML = titleHtml;
    }
}

class FlexRow extends UIBase {
    constructor(core, parent, columns = [], gap = "15px") {
        super(core, parent, 'pts-row', 'div');
        this.gap = gap;
        this.columns = columns; // Array de UIBase ou strings HTML
        
        this.el.style.gap = this.gap;
        this.el.style.marginBottom = "8px";
        this.render();
    }

    render() {
        this.el.innerHTML = '';
        this.columns.forEach(col => {
            const colWrapper = document.createElement('div');
            colWrapper.className = 'pts-col';
            
            if (typeof col === 'string') colWrapper.innerHTML = col;
            else if (col instanceof UIBase) colWrapper.appendChild(col.getNode());
            
            this.el.appendChild(colWrapper);
        });
    }
}

// ==========================================================================
// 4. FACADE (O Orquestrador Público)
// ==========================================================================

class UIFacade {
    constructor(coreUtils) {
        if (!coreUtils) throw new Error("[UIFacade] Instância de CoreUtils é obrigatória.");
        this.core = coreUtils;
        ThemeManager.init();
    }

    toggleTheme() { return ThemeManager.toggle(); }

    // --- Atalhos de Notificação ---
    toast(msg, variant = 'primary', duration = 4000) {
        const t = new Toast(this.core, msg, variant, duration);
        t.show();
        return t;
    }
    success(msg) { return this.toast(msg, 'success'); }
    error(msg)   { return this.toast(msg, 'error', 6000); }
    warning(msg) { return this.toast(msg, 'warning'); }
    info(msg)    { return this.toast(msg, 'info'); }

    // --- Instanciadores (Factory Methods OOP) ---
    createPanel(config) { return new Panel(this.core, config); }
    createCard(parent, config) { return new Card(this.core, parent, config); }
    createButton(parent, text, variant, onClick) { return new Button(this.core, parent, text, variant, onClick); }
    createIconButton(parent, icon, onClick, hover, isInline) { return new IconButton(this.core, parent, icon, onClick, hover, isInline); }
    createFab(icon, onClick, hover) { return new FabButton(this.core, icon, onClick, hover); }
    createBadge(parent, text, variant, appearance) { return new Badge(this.core, parent, text, variant, appearance); }
    createStatusBox(parent, text, variant) { return new StatusBox(this.core, parent, text, variant); }
    createTable(parent, headers, rows, isCompact) { return new Table(this.core, parent, headers, rows, isCompact); }
    createKeyValue(parent, dataObj) { return new KeyValue(this.core, parent, dataObj); }
    createList(parent, items, isOrdered) { return new List(this.core, parent, items, isOrdered); }
    createInput(parent, label, placeholder, type, initVal) { return new Input(this.core, parent, label, placeholder, type, initVal); }
    createDivider(parent, title, style) { return new Divider(this.core, parent, title, style); }
    createFlexRow(parent, columns, gap) { return new FlexRow(this.core, parent, columns, gap); }
}