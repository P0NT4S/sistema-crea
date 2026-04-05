// ==UserScript==
// @name         Utils (Logic & Core)
// @namespace    https://github.com/P0NT4S/
// @version      7.3.5
// @description  Core de utilitários: Manipulação de Texto/Regex, DOM Helpers e Data Mapper do CREA.
// @author       P0nt4s
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================================================
    // 1. LOGGER (Console Avançado)
    // ==========================================================================
    /**
     * Sistema de logs estilizados que se integra ao ThemeCore se disponível.
     */
    const Logger = {
        _scriptName: "Script",

        /**
         * Inicializa o logger com o nome do contexto atual.
         * @param {string} name - Nome do script ou módulo (ex: 'SystemRMO').
         */
        init(name) {
            this._scriptName = name;
            console.log(
                `%c ${name} %c Ready `, 
                `background:#333; color:#fff; border-radius:3px 0 0 3px; padding:2px 5px; font-weight:bold;`,
                `background:#10b981; color:#fff; border-radius:0 3px 3px 0; padding:2px 5px;`
            );
        },

        /**
         * Método interno de impressão.
         * @private
         */
        _print(type, category, message, data = null) {
            // Defensive Programming: Verifica se ThemeCore existe para pegar cores
            const palette = window.ThemeCore ? window.ThemeCore.palette : null;
            
            let color = '#888';
            let icon = '📝';
            
            // Mapeamento de estilos baseados na paleta do tema
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
            }

            // CSS para o Console do DevTools
            const styleTitle = `color: ${color}; font-weight: bold;`;
            
            // Agrupamento colapsado para manter o console limpo
            console.groupCollapsed(
                `%c${this._scriptName}%c ${icon} ${category.toUpperCase()}`, 
                `background:#333; color:#fff; border-radius:3px; padding:2px 5px; font-weight:bold; margin-right:5px;`, 
                styleTitle
            );
            
            console.log(message);
            if (data) console.dir(data); // .dir é melhor para explorar objetos
            console.groupEnd();
        },

        // API Pública do Logger
        success: (cat, msg, data) => Logger._print('success', cat, msg, data),
        error:   (cat, msg, data) => Logger._print('error',   cat, msg, data),
        warning: (cat, msg, data) => Logger._print('warning', cat, msg, data),
        info:    (cat, msg, data) => Logger._print('info',    cat, msg, data),
        primary: (cat, msg, data) => Logger._print('primary', cat, msg, data)
    };

    // ==========================================================================
    // 2. PATTERNS (Regex Centralizado)
    // ==========================================================================
    const Patterns = {
        RMO_ID: /(\d{4}[A-Z]{3}\d{4})/g,
        RMO_ID_STRICT: /^(\d{4}[A-Z]{3}\d{4})$/,
        DATA_BR: /\d{2}\/\d{2}\/\d{4}/,
        DATA_HORA: /\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/
    };

    // ==========================================================================
    // 3. DOM ASYNC HELPERS (Lógica de Espera)
    // ==========================================================================
    const DomLogic = {
        /**
         * Aguarda um elemento aparecer no DOM (MutationObserver).
         * @param {string} selector - Seletor CSS do elemento.
         * @param {number} timeout - Tempo máximo em ms (Padrão: 5000ms).
         * @returns {Promise<Element|null>} Resolve com o elemento ou null se der timeout.
         */
        waitFor(selector, timeout = 5000) {
            return new Promise((resolve, reject) => {
                const el = document.querySelector(selector);
                if (el) return resolve(el);

                const observer = new MutationObserver(() => {
                    const el = document.querySelector(selector);
                    if (el) { 
                        observer.disconnect(); 
                        resolve(el); 
                    }
                });

                observer.observe(document.body, { childList: true, subtree: true });

                // Timeout de segurança para não deixar a Promise pendurada
                setTimeout(() => { 
                    observer.disconnect(); 
                    console.warn(`[Utils] Timeout aguardando elemento: ${selector}`); 
                    resolve(null); 
                }, timeout);
            });
        }
    };

    // ==========================================================================
    // EXPORTAÇÃO GLOBAL
    // Namespace: window.Utils
    // ==========================================================================
    window.Utils = {
        log: Logger,
        patterns: Patterns,
        dom: DomLogic // Apenas lógica (waitFor), sem criação visual direta
    };

})();

/* ==========================================================================
   UTILS (CORE & DATA MAPPER)
   Centraliza utilitários globais e extração de dados do CREA-DF
   ========================================================================== */

(function() {
    'use strict';

    // Garante a existência do namespace principal
    if (!window.Utils) window.Utils = {};

    /* ==========================================================================
       1. UTILITÁRIOS GLOBAIS DE FORMATAÇÃO
       ========================================================================== */
    window.Utils.format = {
        /**
         * Remove todos os caracteres não numéricos de uma string.
         * Ideal para limpar CPFs, CNPJs, CEPs e Telefones.
         * @param {string|number} str - String original com máscara (ex: "776.XXX.XXX-72")
         * @returns {string} Apenas os números (ex: "77672")
         */
        apenasNumeros(str) {
            if (!str) return "";
            return str.toString().replace(/\D/g, '');
        }
    };

    /* ==========================================================================
       3. MANIPULAÇÃO DE TEXTOS E REGEX (Utils.text)
       ========================================================================== */
    window.Utils.text = {
        /**
         * Normaliza uma string trocando pontuações por espaços.
         * Fundamental: Garante que o length original seja mantido 1:1 para não quebrar 
         * os índices do highlight posteriormente.
         * @private
         * @param {string} str - Texto a ser limpo.
         * @returns {string} Texto com pontuações substituídas por espaços.
         */
        _sanitize(str) {
            if (!str) return "";
            // Substitui qualquer pontuação listada por um espaço simples
            return str.replace(/[.,;:\-/\(\)\[\]\{\}"']/g, ' ');
        },

        /**
         * Transforma uma string separada por vírgulas em uma lista de RegEx super flexíveis.
         * @param {string} csvString - A string de busca (ex: '10, conj, "lote a"').
         * @returns {RegExp[]} Array com as regras de Regex compiladas.
         */
        buildHybridRegex(csvString) {
            if (!csvString) return [];
            
            // Separa por vírgula, remove espaços nas bordas e ignora vazios
            const rawList = csvString.split(',').map(x => x.trim()).filter(x => x);
            
            return rawList.map(term => {
                let isExact = term.startsWith('"') && term.endsWith('"');
                let termContent = isExact ? term.slice(1, -1) : term;
                
                // Limpa a pontuação do termo buscado também, para parear com o texto alvo
                let cleanTerm = this._sanitize(termContent).trim();
                
                // ==========================================
                // CASO 1: É puramente um NÚMERO
                // ==========================================
                if (/^\d+$/.test(cleanTerm)) {
                    const numLimpo = parseInt(cleanTerm, 10).toString();
                    return new RegExp(`(?<!\\d)0*${numLimpo}(?!\\d)`, 'gi');
                } 
                // ==========================================
                // CASO 2: É TEXTO EXATO (Originalmente entre aspas "")
                // ==========================================
                else if (isExact) {
                    let escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
                    // Como limpamos a pontuação, o limite de palavra/espaço pode ser feito com \s
                    // (?<=^|\s) garante que antes da palavra tem espaço ou é o começo da frase
                    return new RegExp(`(?<=^|\\s)${escaped}(?=\\s|$)`, 'gi');
                } 
                // ==========================================
                // CASO 3: É TEXTO PARCIAL (Texto livre)
                // ==========================================
                else {
                    let escaped = cleanTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
                    return new RegExp(escaped, 'gi');
                }
            });
        },

        /**
         * Verifica se um texto atende a TODAS as Regex fornecidas.
         * @param {string} text - Texto alvo.
         * @param {RegExp[]} regexList - Array de Regex gerado pelo buildHybridRegex.
         * @returns {boolean}
         */
        checkAll(text, regexList) {
            if (!regexList || regexList.length === 0) return true;
            // Sanitiza o texto alvo ANTES de testar as Regex
            const sanitizedText = this._sanitize(text);
            
            return regexList.every(regex => {
                regex.lastIndex = 0; 
                return regex.test(sanitizedText);
            });
        },

        /**
         * Envolve os trechos de texto que deram 'match' com uma tag HTML para destaque visual.
         * Resolve sobreposição de tags usando mesclagem de intervalos (Interval Merging).
         * @param {string} text - Texto original.
         * @param {RegExp[]} regexList - Lista de expressões.
         * @param {string} [wrapperClass="pts-highlight"] - Classe CSS que será aplicada.
         * @returns {string} String HTML formatada.
         */
        applyHighlight(text, regexList, wrapperClass = 'pts-highlight') {
            if (!text || !regexList || regexList.length === 0) return text;

            // Sanitiza o texto para rodar a Regex de forma limpa, mas guarda o original para o corte
            const sanitizedText = this._sanitize(text);
            let intervals = [];

            // 1. Mapeia todos os índices [Início, Fim] onde a Regex bateu no texto limpo
            regexList.forEach(regex => {
                const localRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
                let match;
                while ((match = localRegex.exec(sanitizedText)) !== null) {
                    intervals.push({ start: match.index, end: match.index + match[0].length });
                    if (match.index === localRegex.lastIndex) localRegex.lastIndex++; // Previne loop infinito
                }
            });

            if (intervals.length === 0) return text;

            // 2. Mescla os intervalos para evitar sobreposição (O Bug do "T" na tag HTML morre aqui)
            intervals.sort((a, b) => a.start - b.start);
            let merged = [intervals[0]];
            
            for (let i = 1; i < intervals.length; i++) {
                let last = merged[merged.length - 1];
                let current = intervals[i];
                
                if (current.start <= last.end) {
                    last.end = Math.max(last.end, current.end); // Estende o highlight atual
                } else {
                    merged.push(current); // Cria um novo bloco de highlight
                }
            }

            // 3. Corta e costura a string ORIGINAL de TRÁS pra FRENTE (para não perder os índices)
            let res = text;
            for (let i = merged.length - 1; i >= 0; i--) {
                let m = merged[i];
                let before = res.substring(0, m.start);
                let highlightedText = res.substring(m.start, m.end); // O texto original preservado (com pontuação se houver no meio)
                let after = res.substring(m.end);
                
                res = `${before}<span class="${wrapperClass}">${highlightedText}</span>${after}`;
            }

            return res;
        }
    };

    /* ==========================================================================
       2. MÓDULO CREA-DF (EXTRATOR DE DADOS)
       Abstrai a complexidade do DOM legado para objetos semânticos.
       ========================================================================== */
    
    /* --- Helpers Privados do Módulo CREA --- */

    const _parseProfissional = (strRaw) => {
        if (!strRaw || strRaw === "N/A") return { registro: "N/A", nome: "N/A", profissao: "N/A" };
        const partes = strRaw.split(" - ").map(p => p.trim());
        return {
            registro:  partes[0] || "N/A",
            nome:      partes[1] || "N/A",
            profissao: partes.slice(2).join(" - ") || "N/A"
        };
    };

    const _getTextoComQuebras = (container) => {
        if (!container) return "";
        let html = container.innerHTML;
        // Transforma tags de estrutura em quebras de linha de texto puro
        html = html.replace(/<br\s*\/?>/gi, '\n');
        html = html.replace(/<\/tr>/gi, '\n');
        html = html.replace(/<\/p>/gi, '\n');
        html = html.replace(/<\/div>/gi, '\n');
        
        const temp = document.createElement('div');
        temp.innerHTML = html;
        return temp.textContent.replace(/\u00a0/g, ' ');
    };

    /* --- Busca bruta por Expressão Regular ignorando o HTML. --- */
    const _buscaForte = (container, regex) => {
        if (!container) return "";
        const textoLimpo = _getTextoComQuebras(container);
        const match = textoLimpo.match(regex);
        return match ? match[1].trim() : "";
    };

    const _extrairDocumentoBruto = (container) => {
        if (!container) return "";
        const match = container.textContent.match(/\d{2,3}\.[\dX]+\.[\dX]+-\d{2}|\d{2}\.[\dX]+\.[\dX]+\/\d{4}-\d{2}/i);
        return match ? match[0] : "";
    };

    /* --- Interface Pública do Módulo CREA --- */
    window.Utils.crea = {
        
        parseListaARTs(source) {
            const doc = typeof source === 'string' ? new DOMParser().parseFromString(source, 'text/html') : source;
            const tabelas = doc.querySelectorAll('table.tela_impressao_fixa');
            const resultados = [];

            tabelas.forEach((tbl) => {
                if (tbl.rows.length < 2) return;

                const linkImpressao = tbl.querySelector('a[href*="form_impressao_tos"]');
                const linkConsulta  = tbl.querySelector('a[href*="form_consulta"]');
                if (!linkImpressao) return;

                const profRaw = tbl.rows[0].cells[2]?.textContent.trim() || "N/A";
                
                // Busca dinâmica 
                let proprietario = "N/A";
                let endereco = "N/A";
                
                // Varre todas as células da tabela buscando a que tem os dados da obra
                const celulas = Array.from(tbl.querySelectorAll('td'));
                const celulaObra = celulas.find(td => td.textContent.includes("Endereço da Obra/Serviço:"));
                
                if (celulaObra) {
                    // O CREA sempre coloca o nome do proprietário dentro de um <b> nesta mesma célula
                    const tagB = celulaObra.querySelector('b');
                    if (tagB) proprietario = tagB.textContent.trim();
                    
                    // Corta o texto exatamente onde começa o endereço
                    const partes = celulaObra.textContent.split("Endereço da Obra/Serviço:");
                    if (partes.length > 1) {
                        endereco = partes[1].trim();
                    }
                }

                const urlBase = 'https://art.creadf.org.br/art1025/publico/';
                const urlImpressaoAbs = new URL(linkImpressao.getAttribute('href'), urlBase).href;
                const urlConsultaAbs = linkConsulta ? new URL(linkConsulta.getAttribute('href'), urlBase).href : "";

                resultados.push({
                    numeroART: linkImpressao.textContent.trim(),
                    urlImpressao: urlImpressaoAbs,
                    urlConsulta: urlConsultaAbs,
                    profissional: _parseProfissional(profRaw),
                    proprietario: proprietario,
                    endereco: endereco,
                    dataRegistro: tbl.rows[0].cells[3]?.textContent.trim() || "",
                    situacao: tbl.rows[0].cells[4]?.textContent.trim() || "N/A"
                });
            });

            let totalOcorrencias = resultados.length;
            let totalPaginas = 1;

            const pPaginacao = Array.from(doc.querySelectorAll('p')).find(p => p.textContent.match(/Ocorr[êe]ncia/i));

            if (pPaginacao) {
                const matchOcor = pPaginacao.textContent.match(/([\d.]+)\s*Ocorr[êe]ncia/i);
                if (matchOcor) totalOcorrencias = parseInt(matchOcor[1].replace(/\./g, ''), 10);

                const elementosNumericos = Array.from(pPaginacao.querySelectorAll('a, font'));
                const numeros = elementosNumericos.map(el => parseInt(el.textContent.replace(/\D/g, ''), 10)).filter(n => !isNaN(n));
                if (numeros.length > 0) totalPaginas = Math.max(...numeros);
            }

            return {
                metadados: { totalOcorrencias, totalPaginas, artsNaPagina: resultados.length },
                arts: resultados
            };
        },

        parseDetalheART(source) {
            const doc = typeof source === 'string' ? new DOMParser().parseFromString(source, 'text/html') : source;

            const secCabecalho = doc.querySelector('#tab_cabecalho');
            const secProfissional = doc.querySelector('#tab_profissional');
            const secContrato = doc.querySelector('#tab_contratos');
            const secObra = doc.querySelector('#tab_dados_obra');
            
            // --- 1. Extração de Endereço ---
            let endereco = { logradouro: "", numero: "", bairro: "", cep: "", complemento: "", cidade: "", uf: "" };
            if (secObra) {
                const tabelaEndereco = secObra.querySelector('hr + table');
                if (tabelaEndereco) {
                    endereco.logradouro = tabelaEndereco.rows[1]?.cells[0]?.textContent.trim() || "";
                    endereco.numero = _buscaForte(tabelaEndereco, /N[úu]mero\s*:\s*([^\n]+)/i);
                    endereco.bairro = _buscaForte(tabelaEndereco, /Bairro\s*:\s*([^\n]+)/i);
                    endereco.cep = _buscaForte(tabelaEndereco, /CEP\s*:\s*([^\n]+)/i);
                    endereco.complemento = _buscaForte(tabelaEndereco, /Complemento\s*:\s*([^\n]+)/i);
                    
                    const cidadeUF = _buscaForte(tabelaEndereco, /Cidade\s*:\s*([^\n]+)/i);
                    if (cidadeUF.includes('-')) {
                        const partes = cidadeUF.split('-');
                        endereco.cidade = partes[0].trim();
                        endereco.uf = partes[1].trim();
                    } else {
                        endereco.cidade = cidadeUF;
                    }
                }
            }

            let coords = _buscaForte(secObra, /Coordenadas\s*Geogr[áa]ficas\s*:\s*([^\n]+)/i);
            if (coords === ",") coords = ""; 

            // --- 2. Extração de Atividades e Observações ---
            const atividadesAgrupadas = [];
            const tabelaAtiv = doc.querySelector('#tab_atividade_tecnica table');
            
            if (tabelaAtiv && tabelaAtiv.rows.length > 0) {
                let topicoAtual = null;

                Array.from(tabelaAtiv.rows).forEach(row => {
                    const celula0 = row.cells[0]?.textContent.trim() || "";

                    // Ignora a linha de rodapé com o aviso
                    if (celula0.includes("Após a conclusão")) return;

                    const celula1 = row.cells[1]?.textContent.trim().toLowerCase() || "";

                    // Se a segunda coluna é "quantidade", sabemos que esta linha é um cabeçalho de Tópico
                    if (celula1 === "quantidade") {
                        topicoAtual = {
                            topico: celula0, // Ex: "Fiscalização", "Elaboração"
                            itens: []
                        };
                        atividadesAgrupadas.push(topicoAtual);
                    } 
                    // Se não for cabeçalho, mas já temos um tópico aberto e a linha não está vazia, é um item
                    else if (topicoAtual && celula0 !== "") {
                        // Limpa os '&nbsp;' que o navegador converte para '\u00a0' e faz o trim
                        const descricao = celula0.replace(/\u00a0/g, ' ').trim();
                        const quantidade = row.cells[1]?.textContent.trim() || "";
                        const unidade = row.cells[2]?.textContent.trim() || "";

                        topicoAtual.itens.push({
                            descricao,
                            quantidade,
                            unidade
                        });
                    }
                });
            }

            let observacoes = "";
            const fieldsets = Array.from(doc.querySelectorAll('fieldset'));
            const obsFs = fieldsets.find(fs => fs.querySelector('legend')?.textContent.includes('Observações'));
            if (obsFs) {
                const font = obsFs.querySelector('font#cp, font[id="cp"]');
                observacoes = font ? _getTextoComQuebras(font).trim() : _getTextoComQuebras(obsFs).replace(/5\.\s*Observações/i, '').trim();
            }

            const dataMatch = _getTextoComQuebras(doc.body).match(/Registrada em:\s*(\d{2}\/\d{2}\/\d{4})/i);
            const docContrato = _extrairDocumentoBruto(secContrato);
            const docObra = _extrairDocumentoBruto(secObra?.querySelector('#linha_PROPRIETARIO'));

            // --- 3. Empresa Contratada ---
            let empresaContratada = { nome: "", registro: "" };
            if (secProfissional) {
                const textoProf = _getTextoComQuebras(secProfissional);
                const nomeEmpresa = textoProf.match(/Empresa contratada\s*:\s*([^\n]+)/i);
                if (nomeEmpresa) {
                    empresaContratada.nome = nomeEmpresa[1].trim();
                    const textoAposEmpresa = textoProf.substring(textoProf.indexOf(nomeEmpresa[0]));
                    const regEmpresa = textoAposEmpresa.match(/Registro\s*:\s*([^\n]+)/i);
                    if (regEmpresa) empresaContratada.registro = regEmpresa[1].trim();
                }
            }

            // --- 4. ARTs Relacionadas ---
            const artsRelacionadas = [];
            if (secCabecalho) {
                const fontRel = secCabecalho.querySelector('font[style*="size:10"]');
                if (fontRel) {
                    const linhas = fontRel.innerHTML.split(/<br\s*\/?>/i);
                    linhas.forEach(linha => {
                        const limpo = linha.replace(/<[^>]+>/g, '').trim();
                        if (limpo) {
                            const match = limpo.match(/(.+?)\s+[aà]\s+(?:ART\s+)?(\d+)/i);
                            if (match) {
                                artsRelacionadas.push({ relacao: match[1].trim(), numero: match[2].trim() });
                            } else {
                                const nums = limpo.match(/\d{10,}/);
                                if (nums) artsRelacionadas.push({ relacao: limpo.replace(nums[0], '').replace(/[aà]\s*$/, '').trim(), numero: nums[0] });
                            }
                        }
                    });
                }
            }

            // --- 5. Contrato ---
            let numContrato = _buscaForte(secContrato, /Contrato\s*:\s*([^\n]+)/i);
            if (!numContrato) {
                numContrato = _buscaForte(secObra, /C[óo]digo\/Obra\s*p[úu]blica\s*:\s*([^\n]+)/i);
            }

            // --- Retorno Consolidado ---
            return {
                numeroART: secCabecalho?.querySelector('font[style*="size:22"]')?.textContent.trim() || "",
                dataRegistro: dataMatch ? dataMatch[1] : "",
                artsRelacionadas: artsRelacionadas,
                
                responsavel: {
                    nome: secProfissional?.querySelector('font#cp b')?.textContent.trim() || "",
                    titulo: _buscaForte(secProfissional, /T[íi]tulo\s*profissional\s*:\s*([^\n]+)/i),
                    registro: _buscaForte(secProfissional, /Registro\s*:\s*([^\n]+)/i),
                    empresaContratada: empresaContratada
                },
                
                contrato: {
                    contratante: _buscaForte(secContrato, /Contratante\s*:\s*([^\n]+)/i),
                    documento: docContrato,
                    documentoLimpo: window.Utils.format.apenasNumeros(docContrato),
                    numeroContrato: numContrato,
                    artVinculada: _buscaForte(secContrato, /Vinculada\s*[aà]?\s*ART\s*:\s*([^\n]+)/i),
                    cep: _buscaForte(secContrato, /CEP\s*:\s*([^\n]+)/i),
                    fone: _buscaForte(secContrato, /Fone\s*:\s*([^\n]+)/i),
                    email: _buscaForte(secContrato, /E-?Mail\s*:\s*([^\n]+)/i)
                },
                
                obra: {
                    proprietario: secObra?.querySelector('#linha_PROPRIETARIO font#cp b')?.textContent.trim() || "",
                    documento: docObra,
                    documentoLimpo: window.Utils.format.apenasNumeros(docObra),
                    fone: _buscaForte(secObra?.querySelector('#linha_E_MAIL'), /Fone\s*:\s*([^\n]+)/i),
                    email: _buscaForte(secObra?.querySelector('#linha_E_MAIL'), /E-?Mail\s*:\s*([^\n]+)/i),
                    finalidade: secObra?.querySelector('#linha_CODIGO_DA_FINALIDADE font#cp b')?.textContent.trim() || "",
                    coordenadas: coords,
                    endereco: endereco
                },
                
                atividadesTecnicas: atividadesAgrupadas,
                observacoes: observacoes
            };
        },

        /**
         * Varre estruturas profundas buscando a menção ao contrato dentro dos detalhes de uma ART.
         * Utilizado para validação secundária quando a busca principal do CREA falha.
         * @param {Object} detalhes - Objeto padronizado extraído pelo Utils.crea.parseDetalheART.
         * @param {string} ano - Ano do contrato em 4 dígitos.
         * @param {RegExp} regex - Regex estrita gerada com o número do contrato.
         * @returns {Object} Retorna { match: boolean, foundText: string }
         */
        checkContractDeep(detalhes, ano, regex) {
            let t1 = detalhes.contrato.numeroContrato || "";
            let t2 = detalhes.observacoes || "";

            const checkLogic = (txt) => {
                if (!txt || !txt.includes(ano)) return false;
                
                // Quebra o texto ao redor do 'ano' e testa se a regex (número) existe nos arredores
                const cl = txt.split(ano).join(" ");
                return regex.test(cl);
            };

            if (checkLogic(t1)) return { match: true, foundText: "Campo Contrato" };
            if (checkLogic(t2)) return { match: true, foundText: "Campo Observações" };
            return { match: false };
        },

        /**
         * Injeta o ID da RMO visualmente na barra superior do sistema (Angular/Ionic Safe).
         * @private
         */
        _injetarVisualToolbar(idRmo, tentativas = 0) {
            if (!idRmo) return;
            const Log = window.Utils.log;

            try {
                const toolbarTitles = document.querySelectorAll('ion-navbar .toolbar-content ion-title .toolbar-title');
                let injetadoComSucesso = false;

                toolbarTitles.forEach(tb => {
                    const texto = tb.textContent || "";
                    
                    if (texto.includes("RMO")) {
                        // Evita duplicar a injeção
                        if (tb.querySelector('.rmo-badge-injetado')) {
                            injetadoComSucesso = true;
                            return; 
                        }

                        const span = document.createElement('span');
                        span.className = 'rmo-badge-injetado';
                        span.textContent = ` : ${idRmo}`;
                        
                        tb.appendChild(span);
                        injetadoComSucesso = true;
                    }
                });

                if (!injetadoComSucesso && tentativas < 10) {
                    setTimeout(() => {
                        this._injetarVisualToolbar(idRmo, tentativas + 1);
                    }, 1000); 
                }
                
            } catch (e) {
                Log.warning("Utils.crea", "Falha não-crítica ao injetar ID visual na toolbar.", e);
            }
        },

        /**
         * Extrai o ID da RMO do DOM com suporte a Cache via sessionStorage.
         * @param {Document|Element} doc - Contexto de busca (padrão: document).
         * @returns {string|null} O ID da RMO encontrado ou null.
         */
        extrairIdRmo(doc = document) {
            const Log = window.Utils.log;
            const CHAVE_CACHE = '_crea_rmo_cache';
            
            // Pega a URL completa, incluindo o Hash (essencial para o roteamento do Ionic)
            let urlAtual = "";
            try { urlAtual = window.location.pathname + window.location.search + window.location.hash; } catch(e){}

            // 1. TENTA CACHE PRIMEIRO
            try {
                const cacheSalvo = sessionStorage.getItem(CHAVE_CACHE);
                if (cacheSalvo) {
                    const dadosCache = JSON.parse(cacheSalvo);
                    if (dadosCache.url === urlAtual && dadosCache.id) {
                        Log.success("Utils.crea", `ID RMO recuperado do cache: ${dadosCache.id}`);
                        this._injetarVisualToolbar(dadosCache.id);
                        return dadosCache.id;
                    }
                }
            } catch (e) {}

            // Salva no cache, injeta visualmente e retorna o ID
            const finalizarComSucesso = (id) => {
                try {
                    sessionStorage.setItem(CHAVE_CACHE, JSON.stringify({ id: id, url: urlAtual }));
                } catch (e) {}
                this._injetarVisualToolbar(id);
                return id;
            };

            // --- INÍCIO DA LÓGICA DE RASPAGEM ORIGINAL ---

            // Estratégia 1: Inputs conhecidos (text ou hidden)
            const inputs = doc.querySelectorAll('input[type="text"], input[type="hidden"]');
            for (let input of inputs) {
                if (input.value && window.Utils.patterns.RMO_ID_STRICT.test(input.value.trim())) {
                    Log.info("Utils.crea", "ID RMO encontrado via Input.");
                    return finalizarComSucesso(input.value.trim());
                }
            }

            // Estratégia 2: Elemento de Título Clássico
            const elTitulo = doc.querySelector('td.td_title');
            if (elTitulo) {
                const match = elTitulo.innerText.match(/RMO:\s*(\d{4}[A-Z]{3}\d{4})/);
                if (match && match[1]) {
                    Log.info("Utils.crea", "ID RMO encontrado via Título da Página.");
                    return finalizarComSucesso(match[1]);
                }
            }

            // Estratégia 3: Fallback buscando a label "Número"
            const elementosTexto = doc.querySelectorAll('td, th, span');
            for (let el of elementosTexto) {
                const texto = el.innerText ? el.innerText.trim() : "";
                if (/N[úu]mero/i.test(texto)) {
                    const textoIrmao = el.nextElementSibling ? el.nextElementSibling.innerText : "";
                    const match = textoIrmao.match(window.Utils.patterns.RMO_ID) || texto.match(window.Utils.patterns.RMO_ID);
                    if (match) {
                        Log.info("Utils.crea", "ID RMO encontrado via Fallback (Label Número).");
                        return finalizarComSucesso(match[0]);
                    }
                }
            }

            // Estratégia 4: Varredura cega (Último recurso)
            const matchGeral = doc.body ? doc.body.textContent.match(window.Utils.patterns.RMO_ID) : doc.textContent.match(window.Utils.patterns.RMO_ID);
            if (matchGeral) {
                Log.warning("Utils.crea", "ID RMO encontrado via varredura global (Último recurso).");
                return finalizarComSucesso(matchGeral[0]);
            }

            Log.error("Utils.crea", "Falha absoluta ao tentar extrair ID da RMO.");
            return null;
        }
    };

})();

/*  ==========================================================================
    4. MÓDULO RMO (CRUD e Integração com Angular)
    ========================================================================== */
window.Utils.rmo = (function() {
    const SELETORES_ALVO = ['page-rmo-novo', 'ion-app', 'body'];
    let _instanciaCache = null;

    // Dicionário de Mapeamento (De/Para) baseando-se nas abas da interface
    const MAPA_ABAS = {
        geral: ['id', 'numero', 'solicitacao', 'dataCadastro', 'tipoFiscalizacao', 'modalidades', 'impedimento', 'situacao', 'fase', 'dataInicio', 'rmo_rota', 'rmo_atividade', 'fis_id', 'pon_numero', 'dataEnvio', 'fiscal', 'titulo_profissional'],
        endereco: ['endereco', 'cep', 'numeroEnd', 'complemento', 'cidade', 'uf', 'ra', 'latitude', 'longitude'],
        proprietario: ['proprietarioCorpLink', 'proprietario', 'cpfCnpjNaoLocalizado', 'cpfCnpj', 'bloqueio_ident', 'desbloqueio_end', 'fone', 'email', 'endereco_proprietario_cep', 'endereco_proprietario', 'endereco_proprietario_numero', 'endereco_proprietario_complemento', 'endereco_proprietario_cidade', 'endereco_proprietario_uf'],
        outros: ['quantitativos', 'semNaoConformidades', 'naoConformidades', 'observacoes', 'declarante']
    };

    function _obterInstanciaAngular(elemento) {
        if (!elemento) return null;
        
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

        if (win.ng && typeof win.ng.getComponent === 'function') return win.ng.getComponent(elemento);
        if (win.ng && typeof win.ng.probe === 'function') {
            const probe = win.ng.probe(elemento);
            if (probe && probe.componentInstance) return probe.componentInstance;
        }
        return null;
    }

    /**
     * Transforma o JSON plano do Angular em um objeto estruturado por abas.
     * @private
     */
    function _estruturarDadosRmo(rawRmo) {
        if (!rawRmo) return null;
        let estruturado = { 
            geral: {}, 
            endereco: {}, 
            proprietario: {}, 
            envolvidos: rawRmo.envolvidos || [], 
            anexos: rawRmo.anexos || [],
            outros: {}
        };

        for (let aba in MAPA_ABAS) {
            MAPA_ABAS[aba].forEach(campo => {
                if (rawRmo[campo] !== undefined) estruturado[aba][campo] = rawRmo[campo];
            });
        }
        return estruturado;
    }

    /**
     * Pega um objeto estruturado (dividido em abas) e o achata para o formato que o Angular exige.
     * @private
     */
    function _achatarDadosRmo(payloadEstruturado) {
        let flatRmo = {};
        for (let chave in payloadEstruturado) {
            // Se a chave for uma aba conhecida e for um objeto, extraímos as propriedades dela
            if (MAPA_ABAS[chave] && typeof payloadEstruturado[chave] === 'object') {
                Object.assign(flatRmo, payloadEstruturado[chave]);
            } 
            // Se for array (envolvidos/anexos) ou uma chave avulsa que o dev mandou direto, passa direto
            else {
                flatRmo[chave] = payloadEstruturado[chave];
            }
        }
        return flatRmo;
    }

    return {
        /**
         * Conecta à instância do Angular e faz o cache para evitar varreduras no DOM.
         * @returns {Object|null}
         */
        conectar: function() {
            if (_instanciaCache) return _instanciaCache;

            for (const seletor of SELETORES_ALVO) {
                const elemento = document.querySelector(seletor);
                if (elemento) {
                    const inst = _obterInstanciaAngular(elemento);
                    if (inst && (inst.form || (inst.rmoService && inst.rmoService.form))) {
                        _instanciaCache = inst;
                        if (window.Utils.log) window.Utils.log.info("Utils.rmo", "Conectado ao Angular via Lazy Loading.");
                        return _instanciaCache;
                    }
                }
            }
            
            if (window.Utils.log) window.Utils.log.error("Utils.rmo", "Falha ao localizar a instância do Angular.");
            return null;
        },

        /**
         * Extrai os dados atuais da RMO mapeados de forma semântica (Geral, Endereço, Proprietário, etc).
         * @param {string} [abaNome=null] - Opcional. Se passar o nome de uma aba (ex: 'endereco'), retorna apenas os dados dela.
         * @returns {Object|null} Clone seguro e estruturado dos dados da RMO.
         * @example
         * const rmoCompleta = Utils.rmo.getDadosRmo();
         * const dadosEndereco = Utils.rmo.getDadosRmo('endereco');
         */
        getDadosRmo: function(abaNome = null) {
            const inst = this.conectar();
            if (!inst) return null;

            const formGroup = inst.form || inst.rmoService.form;

            try {
                const dadosPlanos = JSON.parse(JSON.stringify(formGroup.getRawValue()));
                const dadosEstruturados = _estruturarDadosRmo(dadosPlanos);

                if (abaNome && dadosEstruturados[abaNome]) {
                    return dadosEstruturados[abaNome];
                }

                return dadosEstruturados;
            } catch (err) {
                if (window.Utils.log) window.Utils.log.error("Utils.rmo", `Erro ao formatar dados da RMO: ${err.message}`);
                return null;
            }
        },

        /**
         * Injeta novos dados no formulário da RMO. Aceita formato achatado ou estruturado em abas.
         * @param {Object} payloadRmo - Objeto com os dados a serem injetados. Ex: { endereco: { cep: '70000000' } }
         * @returns {boolean} True se a injeção for bem-sucedida.
         * @example
         * Utils.rmo.setDadosRmo({ proprietario: { email: 'teste@teste.com' } });
         */
        setDadosRmo: function(payloadRmo) {
            const inst = this.conectar();
            if (!inst) return false;

            const formGroup = inst.form || inst.rmoService.form;
            
            // Mágica: Converte o objeto bonito em abas de volta para a bagunça plana do Angular
            const payloadFinal = _achatarDadosRmo(payloadRmo);

            try {
                formGroup.patchValue(payloadFinal);
                if (inst.changeDetectorRef) inst.changeDetectorRef.detectChanges();
                if (window.Utils.log) window.Utils.log.success("Utils.rmo", `Dados da RMO injetados com sucesso.`);
                return true;
            } catch (err) {
                if (window.Utils.log) window.Utils.log.error("Utils.rmo", `Erro ao injetar dados na RMO: ${err.message}`);
                return false;
            }
        },

        /**
         * Adiciona um novo Envolvido na lista da RMO e opcionalmente já preenche seus dados e engatilha a busca nativa.
         * @param {Object} [dadosEnvolvido=null] - Payload plano com os dados do envolvido.
         * @param {string} [buscarPor=null] - Chave para auto-busca do Angular (ex: 'registro', 'documento', 'nome').
         * @returns {boolean} True se criado e preenchido com sucesso.
         */
        adicionarEnvolvido: function(dadosEnvolvido = null, buscarPor = null) {
            const inst = this.conectar();
            if (!inst) return false;

            const formGroup = inst.form || inst.rmoService.form;
            const arrayEnvolvidos = formGroup.get('envolvidos');

            if (!arrayEnvolvidos || typeof inst.rmoService.envolvidoAdicionar !== 'function') {
                if (window.Utils.log) window.Utils.log.error("Utils.rmo", "Estrutura nativa de 'Envolvidos' não encontrada.");
                return false;
            }

            try {
                const novoIndice = arrayEnvolvidos.length;
                
                // Cria a nova linha em branco no Angular
                inst.rmoService.envolvidoAdicionar();
                if (inst.changeDetectorRef) inst.changeDetectorRef.detectChanges();

                if (dadosEnvolvido && Object.keys(dadosEnvolvido).length > 0) {
                    const controleAlvo = formGroup.get(`envolvidos.${novoIndice}`);
                    if (controleAlvo) {
                        // 1. Injeta os dados da ART (Registro, Observações, etc)
                        controleAlvo.patchValue(dadosEnvolvido);
                        if (inst.changeDetectorRef) inst.changeDetectorRef.detectChanges();
                        
                        // 2. --- GATILHO DA AUTO-BUSCA NATIVA ---
                        if (buscarPor && typeof inst.buscarEntidade === 'function') {
                            // Um micro-delay de 100ms só para garantir que o Angular renderizou o patchValue antes de ler
                            setTimeout(() => {
                                inst.buscarEntidade({ tipo: 'envolvido', busca: buscarPor, index: novoIndice });
                            }, 100);
                        }

                        if (window.Utils.log) window.Utils.log.success("Utils.rmo", `Envolvido adicionado no índice [${novoIndice}].`);
                        return true;
                    }
                    return false;
                }

                if (window.Utils.log) window.Utils.log.success("Utils.rmo", `Envolvido vazio criado no índice [${novoIndice}].`);
                return true;

            } catch (err) {
                if (window.Utils.log) window.Utils.log.error("Utils.rmo", `Falha ao adicionar Envolvido: ${err.message}`);
                return false;
            }
        }
    };
})();