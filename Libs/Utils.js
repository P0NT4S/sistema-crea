// ==UserScript==
// @name         Utils (Core & Facade)
// @namespace    https://github.com/P0NT4S/
// @version      8.0.0
// @description  Núcleo de utilitários genéricos estruturado em Classes ES6+ com padrão Facade. Foco em estabilidade e reuso.
// @author       P0nt4s
// ==/UserScript==

/**
 * @class Logger
 * @description Sistema avançado de logs para o console do navegador.
 * Isola as mensagens do script do resto da poluição do site alvo, utilizando agrupamento (groupCollapsed)
 * e estilização visual. É capaz de consumir as cores do sistema (ThemeCore) caso este esteja carregado na página.
 */
class Logger {
    /**
     * @param {string} [contextName="System"] - O nome do módulo ou script que está gerando o log. 
     * Isso ajuda a rastrear a origem do evento no console.
     */
    constructor(contextName = "System") {
        this.contextName = contextName;
    }

    /**
     * Motor interno responsável por formatar e imprimir a mensagem no DevTools.
     * @private
     * @param {string} type - Nível semântico do log (success, error, warning, info, primary).
     * @param {string} category - Categoria ou escopo da ação (ex: "Rede", "DOM", "Parser").
     * @param {string} message - A mensagem principal que descreve o evento.
     * @param {any} [data=null] - (Opcional) Objeto, array ou erro a ser inspecionado.
     */
    _print(type, category, message, data = null) {
        // Tenta buscar as cores dinâmicas do ThemeCore; se não existir, usa um fallback seguro
        const palette = window.ThemeCore ? window.ThemeCore.palette : null;
        let color = '#888';
        let icon = '📝';
        
        if (palette) {
            const map = {
                success: { color: palette.success.base, icon: '✅' },
                error:   { color: palette.error.base,   icon: '❌' },
                warning: { color: palette.warning.base, icon: '⚠️' },
                info:    { color: palette.info.base,    icon: 'ℹ️' },
                primary: { color: palette.primary.base, icon: '🟣' }
            };
            if (map[type]) {
                color = map[type].color;
                icon = map[type].icon;
            }
        } else {
            // Paleta fallback hardcoded para garantir consistência visual caso rode standalone
            const fallbacks = { success: '#10b981', error: '#ef4444', warning: '#fbbf24', info: '#38bdf8', primary: '#8b5cf6' };
            color = fallbacks[type] || color;
        }

        const styleTitle = `color: ${color}; font-weight: bold;`;
        
        // Agrupa o log para manter o console limpo. O usuário expande se quiser ver detalhes.
        console.groupCollapsed(
            `%c${this.contextName}%c ${icon} ${category.toUpperCase()}`, 
            `background:#333; color:#fff; border-radius:3px; padding:2px 5px; font-weight:bold; margin-right:5px;`, 
            styleTitle
        );
        
        console.log(message);
        if (data) console.dir(data); // Utiliza console.dir para permitir exploração interativa de objetos HTML/JSON
        console.groupEnd();
    }

    // Atalhos semânticos da API Pública do Logger
    
    success(cat, msg, data) { this._print('success', cat, msg, data); }
    error(cat, msg, data)   { this._print('error', cat, msg, data); }
    warning(cat, msg, data) { this._print('warning', cat, msg, data); }
    info(cat, msg, data)    { this._print('info', cat, msg, data); }
    primary(cat, msg, data) { this._print('primary', cat, msg, data); }
}

/**
 * @class DomObserver
 * @description Fornece utilitários para lidar com elementos que são carregados dinamicamente (SPAs, React, Angular).
 * Evita o uso de setTimeout/setInterval, preferindo a API nativa de observação do navegador.
 */
class DomObserver {
    /**
     * @param {Logger} logger - Instância do logger injetada pela classe CoreUtils.
     */
    constructor(logger = new Logger("DomObserver")) {
        this.log = logger;
    }

    /**
     * Suspende a execução (await) até que um elemento específico apareça no DOM.
     * Essencial para lidar com formulários legados que demoram a renderizar.
     * * @param {string} selector - O seletor CSS do elemento alvo.
     * @param {number} [timeout=5000] - Tempo máximo de espera em milissegundos antes de abortar.
     * @returns {Promise<Element|null>} Resolve com o elemento encontrado ou null se estourar o timeout.
     */
    async waitFor(selector, timeout = 5000) {
        return new Promise((resolve) => {
            // Verificação imediata: se o elemento já existe, não precisamos ligar o Observer
            const el = document.querySelector(selector);
            if (el) return resolve(el);

            // Cria um observador que reage a mudanças na árvore do documento
            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) { 
                    observer.disconnect(); // CRÍTICO: Desconecta para evitar memory leak
                    resolve(el); 
                }
            });

            // Observa o body inteiro por nós adicionados
            observer.observe(document.body, { childList: true, subtree: true });

            // Trava de segurança (Timeout)
            setTimeout(() => { 
                observer.disconnect(); // CRÍTICO: Libera memória caso o elemento nunca apareça
                this.log.warning("Timeout", `Elemento não renderizou no tempo limite (${timeout}ms): ${selector}`); 
                resolve(null); 
            }, timeout);
        });
    }
}

/**
 * @class TextFormatter
 * @description Especialista em limpeza e manipulação de strings.
 * Resolve problemas complexos como higienização de documentos e aplicação de highlights sem quebrar a estrutura HTML.
 */
class TextFormatter {
    constructor() {
        /** Dicionário global de RegEx nativas para uso frequente. */
        this.patterns = {
            DATA_BR: /\d{2}\/\d{2}\/\d{4}/,
            DATA_HORA: /\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/
        };
    }

    /**
     * Remove tudo que não for número de uma string (Ex: "123.456-78" -> "12345678").
     * @param {string|number} str - O dado sujo.
     * @returns {string} Apenas a cadeia numérica.
     */
    apenasNumeros(str) {
        return str ? str.toString().replace(/\D/g, '') : "";
    }

    /**
     * Normaliza uma string trocando pontuações (vírgulas, aspas, parênteses) por espaços.
     * Mantém o tamanho original (length) da string intacto, fundamental para preservar os índices da Regex.
     * @param {string} str - Texto a ser limpo.
     * @returns {string} Texto higienizado.
     */
    sanitize(str) {
        return str ? str.replace(/[.,;:\-/\(\)\[\]\{\}"']/g, ' ') : "";
    }

    /**
     * Analisa uma string separada por vírgulas (CSV style) e constrói uma lista de RegEx inteligentes.
     * Lida com 3 casos de negócio: Números exatos, Frases exatas (entre aspas) e Texto parcial.
     * * @param {string} csvString - Termos de busca digitados pelo usuário (ex: '10, "fiscal geral", eng').
     * @returns {RegExp[]} Array contendo objetos RegExp prontos para teste.
     */
    buildHybridRegex(csvString) {
        if (!csvString) return [];
        
        // Separa por vírgula e remove espaços nas bordas
        const rawList = csvString.split(',').map(x => x.trim()).filter(x => x);
        
        return rawList.map(term => {
            let isExact = term.startsWith('"') && term.endsWith('"');
            let termContent = isExact ? term.slice(1, -1) : term;
            let cleanTerm = this.sanitize(termContent).trim();
            
            // CASO 1: Apenas números. Garante que "10" não dê match dentro de "100" (usa lookbehinds e lookaheads).
            if (/^\d+$/.test(cleanTerm)) {
                const numLimpo = parseInt(cleanTerm, 10).toString();
                return new RegExp(`(?<!\\d)0*${numLimpo}(?!\\d)`, 'gi');
            } 
            // CASO 2: Texto Exato (estava entre aspas). Dá match apenas na palavra completa.
            else if (isExact) {
                let escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
                return new RegExp(`(?<=^|\\s)${escaped}(?=\\s|$)`, 'gi');
            } 
            // CASO 3: Parcial. Qualquer ocorrência em qualquer lugar.
            else {
                let escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
                return new RegExp(escaped, 'gi');
            }
        });
    }

    /**
     * Verifica se um texto atende a TODAS as Regex fornecidas.
     * @param {string} text - Texto alvo.
     * @param {RegExp[]} regexList - Array de Regex gerado pelo buildHybridRegex.
     * @returns {boolean}
     */
    checkAll(text, regexList) {
        if (!regexList || regexList.length === 0) return true;
        // Sanitiza o texto alvo ANTES de testar as Regex
        const sanitizedText = this.sanitize(text);
        
        return regexList.every(regex => {
            regex.lastIndex = 0; 
            return regex.test(sanitizedText);
        });
    }

    /**
     * Envolve os trechos de texto que casaram com as Regex em uma tag `<span>` para destaque visual.
     * Resolve automaticamente problemas de sobreposição usando Merging de Intervalos (ex: evitar criar `<span>te<span>x</span>to</span>`).
     * * @param {string} text - O texto original que receberá as marcações HTML.
     * @param {RegExp[]} regexList - Lista gerada pelo método `buildHybridRegex`.
     * @param {string} [wrapperClass='pts-highlight'] - A classe CSS aplicada aos trechos destacados.
     * @returns {string} String contendo o texto e as tags HTML mescladas.
     */
    applyHighlight(text, regexList, wrapperClass = 'pts-highlight') {
        if (!text || !regexList || regexList.length === 0) return text;

        // Sanitiza para a Regex conseguir ler sem ser atrapalhada por pontuações legadas
        const sanitizedText = this.sanitize(text);
        let intervals = [];

        // 1. Mapeia as posições exatas (Início e Fim) de todos os matches no texto
        regexList.forEach(regex => {
            const localRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
            let match;
            while ((match = localRegex.exec(sanitizedText)) !== null) {
                intervals.push({ start: match.index, end: match.index + match[0].length });
                if (match.index === localRegex.lastIndex) localRegex.lastIndex++; // Previne loop infinito
            }
        });

        if (intervals.length === 0) return text;

        // 2. Mescla os intervalos que se sobrepõem
        intervals.sort((a, b) => a.start - b.start);
        let merged = [intervals[0]];
        
        for (let i = 1; i < intervals.length; i++) {
            let last = merged[merged.length - 1];
            let current = intervals[i];
            
            if (current.start <= last.end) {
                last.end = Math.max(last.end, current.end); // Estende o bloco atual
            } else {
                merged.push(current); // Cria um novo bloco não conectado
            }
        }

        // 3. Monta a string HTML final de TRÁS PRA FRENTE. 
        // Cortar de trás pra frente garante que os índices armazenados não sejam corrompidos
        // ao adicionarmos tags no meio do texto original.
        let res = text;
        for (let i = merged.length - 1; i >= 0; i--) {
            let m = merged[i];
            let before = res.substring(0, m.start);
            let highlightedText = res.substring(m.start, m.end);
            let after = res.substring(m.end);
            
            res = `${before}<span class="${wrapperClass}">${highlightedText}</span>${after}`;
        }

        return res;
    }
}

/**
 * @class CoreUtils
 * @description O Ponto de Entrada (Facade). 
 * Esta classe atua como um maestro, instanciando os utilitários de baixo nível e injetando
 * as dependências adequadas neles (Inversão de Controle / DI).
 */
class CoreUtils {
    /**
     * Instancia todo o ecosistema genérico de ferramentas.
     * * @param {Object} config - Configurações que ditam o comportamento do núcleo.
     * @param {string} [config.logName="App"] - Define a etiqueta que aparecerá no Console para estes utilitários.
     * * @example
     * const core = new CoreUtils({ logName: "Extrator CREA" });
     * core.log.success("Status", "Carregado");
     * await core.dom.waitFor("#tabela");
     */
    constructor(config = {}) {
        const logName = config.logName || "App";
        
        // Instancia as ferramentas e faz o acoplamento controlado
        this.log = new Logger(logName);
        this.dom = new DomObserver(this.log); 
        this.text = new TextFormatter();
    }
}