// ==UserScript==
// @name         UIFactory (Visual Components)
// @namespace    http://tampermonkey.net/
// @version      6.0.1
// @description  Biblioteca UI e Design System (.pts- namespace): Componentes interativos e Templates HTML padronizados.
// @author       P0nt4s
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================================================
    // 0. THEME MANAGER (Controle de Estado do Tema)
    // ==========================================================================
    /**
     * Gerencia a alternância entre os temas Claro e Escuro interagindo com o CSS Global.
     */
    const ThemeManager = {
        _storageKey: 'pts_theme_pref',

        /**
         * Inicializa o tema lendo a preferência salva no localStorage.
         * Deve ser chamado logo após o carregamento da página no script principal.
         */
        init() {
            const saved = localStorage.getItem(this._storageKey);
            if (saved === 'light') {
                document.documentElement.setAttribute('data-theme', 'light');
            }
        },

        /**
         * Alterna entre os temas claro e escuro e salva a preferência.
         * @returns {string} O tema atual ativo ('light' ou 'dark').
         */
        toggle() {
            const html = document.documentElement;
            const isLight = html.getAttribute('data-theme') === 'light';

            if (isLight) {
                html.removeAttribute('data-theme');
                localStorage.setItem(this._storageKey, 'dark');
                return 'dark';
            } else {
                html.setAttribute('data-theme', 'light');
                localStorage.setItem(this._storageKey, 'light');
                return 'light';
            }
        },

        /**
         * Força a aplicação de um tema específico.
         * @param {string} theme - 'light' ou 'dark'
         */
        set(theme) {
            if (theme === 'light') {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem(this._storageKey, 'light');
            } else {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem(this._storageKey, 'dark');
            }
        }
    };

    // ==========================================================================
    // 1. PRIMITIVOS (Elementos Básicos)
    // ==========================================================================
    const Primitives = {
        /**
         * Cria um Badge (Etiqueta visual para status ou categorias).
         * @param {Object} opts - Configurações do badge.
         * @param {string} opts.label - Texto a ser exibido.
         * @param {string} [opts.variant="primary"] - Cor semântica (primary, success, error, warning, info).
         * @param {string} [opts.style="fill"] - Estilo visual (fill, outline, ghost).
         * @returns {HTMLElement} O elemento span formatado.
         */
        createBadge({ label, variant = "primary", style = "fill" }) {
            const el = document.createElement('span');
            
            // Validação de segurança para garantir que apenas classes existentes sejam aplicadas
            const safeVar = ["success","error","warning","info","primary"].includes(variant) ? variant : "primary";
            const safeSty = ["fill","outline","ghost"].includes(style) ? style : "fill";

            el.className = `pts-badge pts-badge--${safeSty} variant-${safeVar}`;
            el.innerText = label;
            return el;
        },

        /**
         * Cria um Link padronizado com suporte a callbacks.
         * @param {Object} opts - Configurações do link.
         * @param {string} opts.label - Texto do link.
         * @param {string} [opts.href="#"] - URL de destino (opcional).
         * @param {function} [opts.onClick] - Função de callback ao clicar (previne navegação padrão).
         * @param {boolean} [opts.subtle=false] - Se true, aplica estilo discreto (cinza).
         * @returns {HTMLElement} O elemento âncora (<a>).
         */
        createLink({ label, href = "#", onClick, subtle = false }) {
            const el = document.createElement('a');
            el.className = subtle ? 'pts-link pts-link--subtle' : 'pts-link';
            el.href = href;
            el.innerText = label;
            
            if (onClick) {
                el.addEventListener('click', (e) => {
                    e.preventDefault(); // Impede o comportamento padrão do href
                    onClick(e);
                });
            }
            return el;
        },

        /**
         * Cria um Botão de Ícone (Emoji ou SVG) com efeito hover padronizado.
         * @param {Object} opts - Configurações do botão.
         * @param {string} opts.icon - O emoji ou HTML do ícone (ex: '🏢').
         * @param {string} [opts.id] - ID opcional do elemento.
         * @param {string} [opts.tooltip] - Texto do hover (title).
         * @param {string} [opts.size="16px"] - Tamanho do ícone.
         * @param {function} [opts.onClick] - Função de callback ao clicar.
         * @returns {HTMLElement} O elemento button.
         */
        createIconButton({ icon, id = "", tooltip = "", size = "16px", onClick }) {
            const btn = document.createElement('button');
            if (id) btn.id = id;
            
            btn.className = 'pts-btn-icon pts-hover-scale'; 
            btn.innerHTML = icon;
            btn.style.fontSize = size;
            if (tooltip) btn.title = tooltip;

            if (onClick) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    onClick(e);
                });
            }
            return btn;
        }
    };

    // ==========================================================================
    // 2. ESTRUTURAS (Componentes de Layout)
    // ==========================================================================
    const Structures = {
        /**
         * Cria um Card com borda lateral colorida e suporte a cabeçalho (Título/Fechar).
         * @param {Object} opts - Configurações do card.
         * @param {string} [opts.title] - Título opcional exibido no cabeçalho.
         * @param {string} [opts.html] - Conteúdo HTML do corpo (Prioritário).
         * @param {string} [opts.text] - Conteúdo Texto do corpo (Fallback).
         * @param {string} [opts.variant="primary"] - Cor da borda lateral (primary, success, error, warning, info).
         * @param {boolean} [opts.closeButton=false] - Se true, exibe o "X" no cabeçalho.
         * @param {function} [opts.onClose] - Callback executado após fechar o card.
         * @returns {HTMLElement} O elemento div do card.
         */
        createCard(opts) {
            const card = document.createElement('div');
            const safeVar = opts.variant || "primary";
            card.className = `pts-card pts-card--${safeVar}`;

            // --- 1. Construção do Cabeçalho (Se necessário) ---
            if (opts.closeButton || opts.title) {
                const header = document.createElement('div');
                header.className = 'pts-card-header';

                // Título (Lado Esquerdo)
                const titleSpan = document.createElement('span');
                if (opts.title) {
                    titleSpan.className = 'pts-card-title';
                    titleSpan.innerText = opts.title;
                }
                header.appendChild(titleSpan);

                // Botão Fechar (Lado Direito)
                if (opts.closeButton) {
                    const btn = document.createElement('button');
                    btn.className = 'pts-close-btn'; 
                    btn.innerHTML = '&times;';
                    btn.onclick = () => {
                        card.remove(); 
                        if (opts.onClose) opts.onClose();
                    };
                    header.appendChild(btn);
                }
                card.appendChild(header);
            }

            // --- 2. Conteúdo do Corpo ---
            const body = document.createElement('div');
            if (opts.html) body.innerHTML = opts.html;
            else if (opts.text) body.innerText = opts.text;
            
            card.appendChild(body);

            return card;
        },

        /**
         * Cria um container de Abas (Tabs) para navegação interna.
         * Gerencia automaticamente a classe '.active' entre os itens.
         * @param {Object} opts - Configurações.
         * @param {Array<{label: string, active: boolean, onClick: function}>} opts.items - Lista de abas.
         * @returns {HTMLElement} O container das abas.
         */
        createTabs(opts) {
            const container = document.createElement('div');
            container.className = 'pts-tabs-container';

            opts.items.forEach(item => {
                const tab = document.createElement('div');
                tab.className = `pts-tab ${item.active ? 'active' : ''}`;
                tab.innerHTML = `<span class="pts-tab-label">${item.label}</span>`;

                tab.onclick = () => {
                    // Limpa o estado ativo de todos os irmãos
                    Array.from(container.children).forEach(c => c.classList.remove('active'));
                    // Ativa a aba clicada
                    tab.classList.add('active');
                    // Executa a lógica do chamador
                    if (item.onClick) item.onClick();
                };

                container.appendChild(tab);
            });

            return container;
        }
    };

    // ==========================================================================
    // 3. TOAST MANAGER (Notificações Flutuantes)
    // ==========================================================================
    /**
     * Gerencia notificações do sistema (Singleton).
     */
    const ToastManager = {
        _container: null,

        /**
         * Retorna ou cria o container fixo para os toasts.
         * @private
         */
        _getContainer() {
            if (!this._container) {
                this._container = document.querySelector('.pts-toast-container');
                if (!this._container) {
                    this._container = document.createElement('div');
                    this._container.className = 'pts-toast-container';
                    document.body.appendChild(this._container);
                }
            }
            return this._container;
        },

        /**
         * Renderiza um Toast na tela.
         * @param {string} msg - Mensagem.
         * @param {string} type - Tipo semântico (success, error, warning, info, primary).
         * @param {number} duration - Tempo em ms até sumir. Use 0 para persistente.
         * @param {boolean} dismissible - Se true (padrão), permite fechar ao clicar.
         */
        show(msg, type = 'primary', duration = 4000, dismissible = true) {
            const c = this._getContainer();
            const el = document.createElement('div');
            const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️', primary: '🟣' };
            
            el.className = `pts-toast pts-toast--${type}`;
            el.innerHTML = `<span>${icons[type]||'•'}</span><span>${msg}</span>`;
            
            c.appendChild(el);
            
            const fecharToast = () => {
                el.classList.add('pts-toast-out');
                el.addEventListener('transitionend', () => el.remove());
            };

            // Aplica a lógica de fechamento manual apenas se permitido
            if (dismissible) {
                el.style.cursor = 'pointer'; 
                el.title = "Clique para fechar";
                el.onclick = fecharToast;
            }
            
            if (duration > 0) {
                setTimeout(fecharToast, duration);
            }
        },

        // Atalhos semânticos para facilitar o uso
        success: (m) => ToastManager.show(m, 'success'),
        error:   (m) => ToastManager.show(m, 'error', 6000), // Erros persistem por mais tempo
        warning: (m) => ToastManager.show(m, 'warning'),
        info:    (m) => ToastManager.show(m, 'info'),
        primary: (m) => ToastManager.show(m, 'primary')
    };

    // ==========================================================================
    // 4. PANEL FACTORY (Janelas Modais/Draggables)
    // ==========================================================================
    const PanelFactory = {
        /**
         * Cria ou restaura um painel flutuante.
         * @param {Object} options - Configurações detalhadas do painel.
         * @param {string} options.id - ID único (obrigatório para persistência).
         * @param {boolean} [options.compact=false] - Se true, aplica layout denso (menos padding).
         * @param {boolean} [options.persist=false] - Se true, o botão fechar apenas oculta (display:none).
         * @returns {HTMLElement} O elemento do painel.
         */
        create(options) {
            const config = {
                id: `panel-${Date.now()}`, title: "Painel", html: "",
                width: "auto", draggable: true, persist: false, closeButton: true,
                compact: false, pos: null, ...options
            };

            // --- Lógica de Persistência ---
            const existing = document.getElementById(config.id);
            if (existing) {
                if (config.persist) {
                    existing.style.display = 'flex';
                    existing.style.opacity = '1';
                    
                    if (config.compact) existing.classList.add('pts-panel--compact');
                    else existing.classList.remove('pts-panel--compact');
                    
                    return existing;
                }
                existing.remove();
            }

            // --- Criação do DOM ---
            const panel = document.createElement('div');
            panel.id = config.id;
            panel.className = config.compact ? 'pts-panel pts-panel--compact' : 'pts-panel';
            
            if (config.width) panel.style.width = config.width;

            // Tratamento de Posicionamento
            if (config.pos) {
                // Posicionamento Manual
                Object.assign(panel.style, { 
                    top: 'auto', left: 'auto', transform: 'none', 
                    ...config.pos 
                });
            } else {
                // Posicionamento Padrão (Centralizado via JS)
                panel.style.top = "50%";
                panel.style.left = "50%";
                panel.style.transform = "translate(-50%, -50%)";
            }

            const btnCloseHtml = config.closeButton 
                ? `<button class="pts-close-btn" id="${config.id}-close">&times;</button>` 
                : ``;

            panel.innerHTML = `
                <div class="pts-panel-header" id="${config.id}-header" style="cursor: ${config.draggable ? 'move' : 'default'}">
                    <span class="pts-panel-title">${config.title}</span>
                    ${btnCloseHtml}
                </div>
                <div class="pts-panel-body">${config.html}</div>
            `;

            document.body.appendChild(panel);

            // --- Bind de Eventos ---
            if (config.closeButton) {
                document.getElementById(`${config.id}-close`).onclick = () => {
                    if (config.persist) panel.style.display = 'none';
                    else panel.remove();
                };
            }

            if (config.draggable) this._makeDraggable(panel, document.getElementById(`${config.id}-header`));
            
            return panel;
        },

        /**
         * Torna um elemento arrastável via Mouse Events, impedindo que saia da viewport.
         * @private
         */
        _makeDraggable(elmnt, handle) {
            let pos1=0, pos2=0, pos3=0, pos4=0;
            if(!handle) return;
            
            handle.onmousedown = (e) => {
                e = e || window.event;
                if (e.target.closest('.pts-close-btn')) return;

                e.preventDefault();
                pos3 = e.clientX; pos4 = e.clientY;
                
                const rect = elmnt.getBoundingClientRect();

                elmnt.style.right = 'auto'; 
                elmnt.style.bottom = 'auto';
                elmnt.style.transform = 'none'; 
                elmnt.style.margin = '0';
                
                elmnt.style.left = rect.left + 'px'; 
                elmnt.style.top = rect.top + 'px';
                
                document.onmouseup = () => { document.onmouseup=null; document.onmousemove=null; };
                
                document.onmousemove = (e) => {
                    e.preventDefault();
                    pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
                    pos3 = e.clientX; pos4 = e.clientY;
                    
                    // Cálculo da nova posição
                    let newTop = elmnt.offsetTop - pos2;
                    let newLeft = elmnt.offsetLeft - pos1;
                    
                    // LIMITES DA VIEWPORT (Garante que o cabeçalho não suma)
                    newTop = Math.max(0, Math.min(newTop, window.innerHeight - handle.offsetHeight));
                    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - (elmnt.offsetWidth * 0.5)));
                    
                    elmnt.style.top = newTop + "px";
                    elmnt.style.left = newLeft + "px";
                };
            };
        }
    };

    // ==========================================================================
    // 5. FAB FACTORY (Botões de Ação)
    // ==========================================================================
    const FabFactory = {
        /**
         * Cria um botão flutuante. Pode gerenciar a abertura/fechamento de um painel automaticamente.
         * @param {string} icon - Emoji ou HTML do ícone.
         * @param {string} tooltip - Texto ao passar o mouse.
         * @param {string} [targetPanelId] - (Opcional) ID do painel que ele deve abrir/fechar.
         * @param {function} [onClick] - (Opcional) Ação customizada extra.
         */
        create(icon, tooltip = "Ação", targetPanelId = null, onClick = null) {
            const existing = document.querySelectorAll('.pts-btn-fab');
            const offset = 20 + (existing.length * 60);
            
            const btn = document.createElement("button");
            btn.className = "pts-btn-fab";
            btn.innerHTML = icon;
            btn.title = tooltip;
            btn.style.bottom = `${offset}px`;
            
            btn.onclick = (e) => {
                // Lógica centralizada de Toggle
                if (targetPanelId) {
                    const panel = document.getElementById(targetPanelId);
                    if (panel) {
                        panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'flex' : 'none';
                    }
                }
                // Dispara função extra, se houver
                if (onClick) onClick(e);
            };
            
            document.body.appendChild(btn);
            return btn;
        }
    };

    // ==========================================================================
    // 6. TEMPLATES (Geradores de HTML Estrutural Genérico)
    // ==========================================================================
    const Templates = {
        /**
         * Cria uma estrutura genérica de Chave-Valor (Key-Value).
         */
        keyValue(label, valueHtml, valueId = "") {
            const idAttr = valueId ? `id="${valueId}"` : '';
            return `
                <div style="margin-bottom: 4px;">
                    <span class="pts-kv-label">${label}</span>
                    <span class="pts-kv-value" ${idAttr}>${valueHtml}</span>
                </div>
            `;
        },

        /**
         * Cria uma linha flexível com múltiplas colunas.
         * @param {Array<string|Object>} cols - Array de strings HTML (flex:1) ou objetos { html: string, flex: number }.
         * @param {string} [gap="15px"] - Espaçamento entre as colunas.
         */
        flexRow(cols, gap = "15px") {
            const colsHtml = cols.map(col => {
                if (typeof col === 'string') return `<div style="flex: 1;">${col}</div>`;
                return `<div style="flex: ${col.flex || 1};">${col.html}</div>`;
            }).join('');
            
            return `<div class="pts-row" style="gap: ${gap}; margin-bottom: 8px;">${colsHtml}</div>`;
        },

        /**
         * Cria a estrutura HTML completa de um campo de formulário.
         */
        formInput({ label, id = "", value = "", placeholder = "", type = "text" }) {
            const idAttr = id ? `id="${id}"` : '';
            return `
                <div class="pts-group">
                    <label class="pts-label">${label}</label>
                    <input type="${type}" ${idAttr} class="pts-input" placeholder="${placeholder}" value="${value}">
                </div>
            `;
        },

        /**
         * Cria a estrutura HTML de um divisor com título opcional e estilo customizável.
         * @param {string} title - Título da sessão (opcional).
         * @param {string} borderStyle - "dashed", "solid", "dotted", ou "none" (desligado).
         */
        divider(title = "", borderStyle = "dashed") {
            const titleHtml = title ? `<div style="font-weight: 600; color: var(--th-primary-light); margin-bottom: 4px;">${title}</div>` : '';
            const borderCss = borderStyle === "none" ? "border: none;" : `border-top: 1px ${borderStyle} rgba(255,255,255,0.1);`;
            
            return `
                <div style="${borderCss} margin-top: 8px; padding-top: 8px;">
                    ${titleHtml}
                </div>
            `;
        },

        /**
         * Transforma um Array de strings/HTML em uma lista visual padrão.
         * @param {string[]} items - Lista de itens.
         * @param {boolean} [ordered=false] - Se true, usa <ol> (numerada) em vez de <ul> (marcadores).
         */
        list(items, ordered = false) {
            if (!items || items.length === 0) return "";
            const tag = ordered ? 'ol' : 'ul';
            const lis = items.map(item => `<li style="margin-bottom: 4px;">${item}</li>`).join('');
            return `<${tag} style="margin: 0; padding-left: 20px; font-size: 13px; color: var(--th-text);">${lis}</${tag}>`;
        },

        /**
         * Cria uma mensagem centralizada para quando não há dados a exibir.
         * @param {string} message - O texto a ser exibido.
         */
        emptyState(message) {
            return `<div style="text-align: center; padding: 10px; color: var(--th-text-muted); font-size: 13px;">${message}</div>`;
        },

        /**
         * Cria a estrutura HTML de uma Tabela padronizada e responsiva.
         * @param {Object} opts - Configurações da tabela.
         * @param {Array<string>} opts.headers - Lista de títulos das colunas.
         * @param {Array<Array<string>>} opts.rows - Matriz com os dados das linhas (HTML permitido).
         * @param {boolean} [opts.compact=false] - Se true, aplica o layout denso.
         * @returns {string} String HTML completa da tabela dentro de seu container.
         */
        table({ headers = [], rows = [], compact = false }) {
            // Se não tem dados nenhum, reaproveitamos o state vazio que já existe na fábrica
            if (!headers.length && !rows.length) {
                return this.emptyState("Sem dados para exibir na tabela.");
            }

            const tableClass = compact ? 'pts-table pts-table--compact' : 'pts-table';

            // Monta o Cabeçalho (thead)
            const theadHtml = headers.length > 0
                ? `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>`
                : '';

            // Monta o Corpo (tbody)
            const colspanCounter = Math.max(headers.length, 1);
            const tbodyHtml = `<tbody>${
                rows.length > 0
                    ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')
                    : `<tr><td colspan="${colspanCounter}" style="text-align:center; color:var(--th-text-muted); padding: 16px;">Nenhum registro encontrado.</td></tr>`
            }</tbody>`;

            // Retorna tudo envelopado no container que garante a barra de rolagem horizontal se necessário
            return `
                <div class="pts-table-container">
                    <table class="${tableClass}">
                        ${theadHtml}
                        ${tbodyHtml}
                    </table>
                </div>
            `;
        },

        /**
         * Envolve um conteúdo longo em uma área com barra de rolagem vertical.
         * @param {string} contentHtml - O conteúdo interno.
         * @param {string} [maxHeight="200px"] - Altura máxima antes de rolar.
         */
        scrollableArea(contentHtml, maxHeight = "200px") {
            return `<div style="max-height: ${maxHeight}; overflow-y: auto; padding-right: 5px; font-size: 13px;">${contentHtml}</div>`;
        },

        /**
         * Cria um span interativo pronto para ser copiado ao clicar.
         * O script chamador deve atrelar o evento de clique posteriormente (baseado na classe .pts-copy).
         * @param {string} display - O texto que aparece na tela (com máscara).
         * @param {string} cleanValue - O valor que vai pro clipboard (limpo).
         * @param {string} [title="Copiar dado"] - Tooltip nativa do mouse.
         * @param {string} [variant="primary"] - Cor semântica (primary, success, warning, error, info).
         */
        copyableText(display, cleanValue, title = "Copiar dado", variant = "primary") {
            if (!display || display === "N/A" || display === "N/D") return display || "N/A";
            
            // Garante que só variantes mapeadas no CSS passem (fallback pro primary)
            const safeVar = ["success", "error", "warning", "info", "primary"].includes(variant) ? variant : "primary";
            
            return `<span class="pts-copy pts-copy--${safeVar}" title="${title}" data-clean="${cleanValue}">${display}</span>`;
        }
    };

    // ==========================================================================
    // EXPORTAÇÃO GLOBAL
    // Namespace: window.UIFactory
    // ==========================================================================
    window.UIFactory = {
        theme: ThemeManager,
        toast: ToastManager,
        createPanel: (o) => PanelFactory.create(o),
        createFab: FabFactory.create,
        createBadge: Primitives.createBadge,
        createLink: Primitives.createLink,
        createIconButton: Primitives.createIconButton,
        createCard: Structures.createCard,
        createTabs: Structures.createTabs,
        templates: Templates
    };
})();