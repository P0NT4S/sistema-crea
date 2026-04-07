// ==UserScript==
// @name         Communication Bridge (HTTP API & ART - GM)
// @namespace    https://github.com/P0NT4S/
// @version      4.2.2
// @description  Camada de comunicação: API REST Local e Utilitários de Requisição para o CREA (ART).
// @author       P0nt4s
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    /* ==============================
       CONFIGURAÇÕES DO SCRIPT
       ============================== */
    const CONFIG = {
        // Flag principal para alternar entre o Mock Server e o CREA oficial
        MODO_TESTE: true, 
        
        // Mantemos sua API Local do FastAPI intacta
        API_LOCAL_URL: 'http://127.0.0.1:6969', 
        
        // Mapeamento de URLs para facilitar a manutenção
        URLS_ART: {
            PRODUCAO: 'https://art.creadf.org.br/art1025/publico/consultas_ret.php',
            TESTE: 'http://localhost:8989' // Aponta para o seu servidor Python (CatchAllHandler)
        },

        HEADERS_PADRAO: {
            'Content-Type': 'application/json'
        },

        /**
         * Retorna a URL base do CREA dinamicamente de acordo com o ambiente atual.
         * @returns {string} URL de teste ou de produção.
         */
        get API_ART_URL() {
            return this.MODO_TESTE ? this.URLS_ART.TESTE : this.URLS_ART.PRODUCAO;
        }
    };

    const Log = window.Utils && window.Utils.log ? window.Utils.log : { 
        success: console.log, info: console.log, error: console.error, warning: console.warning, primary: console.log 
    };

    const UI = window.UIFactory && window.UIFactory.toast ? window.UIFactory : {
        toast: { error: (msg) => alert(`[ERRO] ${msg}`), warning: (msg) => alert(`[AVISO] ${msg}`) }
    };

    /* ==========================================================================
       MÉTODOS PRIVADOS
       ========================================================================== */
    
    /**
     * Faz requisições padronizadas para a API Local.
     * @private
     */
    const _fazerRequisicaoApiLocal = (metodo, endpoint, dados = null, ignorar404 = false) => {
        const url = `${CONFIG.API_LOCAL_URL}${endpoint}`;
        const logContext = "CommAPILocal";
        
        return new Promise((resolve, reject) => {
            const opcoes = {
                method: metodo,
                url: url,
                headers: dados ? CONFIG.HEADERS_PADRAO : {},
                onload: function(resposta) {
                    if (resposta.status === 404 && ignorar404) {
                        Log.info(logContext, `Recurso não encontrado (404), tratado como null: ${endpoint}`);
                        return resolve(null);
                    }

                    if (resposta.status < 200 || resposta.status >= 300) {
                        let mensagemLimpa = `Erro no servidor (Status ${resposta.status})`;
                        try {
                            const erroJson = JSON.parse(resposta.responseText);
                            if (erroJson && erroJson.detail) {
                                mensagemLimpa = Array.isArray(erroJson.detail) 
                                    ? "Dados inválidos: " + erroJson.detail.map(e => e.msg).join(", ") 
                                    : erroJson.detail; 
                            }
                        } catch (e) {
                            Log.warning(logContext, "O erro retornado pelo backend não é um JSON válido.", resposta.responseText);
                        }

                        Log.error(logContext, `Erro [${metodo}] ${endpoint}`, { status: resposta.status, msg: mensagemLimpa });
                        return reject(new Error(mensagemLimpa));
                    }

                    try {
                        const json = JSON.parse(resposta.responseText);
                        Log.success(logContext, `Sucesso [${metodo}] ${endpoint}`, { payload: json });
                        resolve(json);
                    } catch (e) {
                        Log.error(logContext, "Falha ao processar resposta JSON.", e);
                        reject(new Error("Falha ao processar resposta JSON."));
                    }
                },
                onerror: function(erro) {
                    Log.error(logContext, `Falha de rede na requisição [${metodo}] ${endpoint}`, erro);
                    if(UI.toast) UI.toast.error("Falha de comunicação com o servidor local.");
                    reject(new Error("NetworkError"));
                }
            };

            if (dados) opcoes.data = JSON.stringify(dados);
            GM_xmlhttpRequest(opcoes);
        });
    };

    /* ==========================================================================
       NAMESPACE PÚBLICO: CommBridge
       ========================================================================== */
    const CommBridge = {

        /**
         * Define se as requisições devem apontar para o Mock Server local ou para o CREA oficial.
         * @param {boolean} status - true para ativar o ambiente de testes.
         */
        definirModoTeste(status) {
            CONFIG.MODO_TESTE = !!status;
            Log.warning("CommBridge", `Ambiente alterado. Modo de Teste: ${CONFIG.MODO_TESTE}`);
        },

        /**
         * Retorna a URL base do CREA configurada para o ambiente atual.
         * @returns {string} URL de destino das consultas.
         */
        get urlBaseArt() {
            return CONFIG.API_ART_URL;
        },
        
        /**
         * Módulo da API do CREA: Raspagem de dados e requisições para os sistemas da ART.
         */
        apiART: {
            /**
             * Faz uma requisição HTTP assíncrona burlando o CORS usando a API do Tampermonkey.
             * @param {string} [url=CONFIG.API_ART_URL] - A URL destino. Padrão é o endpoint de consultas.
             * @param {string} [metodo="GET"] - O método HTTP (GET, POST, etc).
             * @param {string|FormData|Object} [dados=null] - O payload da requisição (útil para POST).
             * @param {Object} [headers={}] - Headers customizados.
             * @returns {Promise<Object>} Resolve com a resposta nativa do request.
             */
            fetchAsync(url = CONFIG.API_ART_URL, metodo = "GET", dados = null, headers = {}) {
                return new Promise((resolve, reject) => {
                    if (typeof GM_xmlhttpRequest === "undefined") {
                        return reject(new Error("GM_xmlhttpRequest não definido. Falta @grant no cabeçalho?"));
                    }
                    
                    const opcoes = {
                        method: metodo,
                        url: url,
                        headers: headers,
                        onload: r => (r.status >= 200 && r.status < 300) ? resolve(r) : reject(new Error(`HTTP ${r.status}`)),
                        onerror: reject
                    };

                    if (dados) opcoes.data = dados;

                    GM_xmlhttpRequest(opcoes);
                });
            },

            /**
             * Atalho prático para buscar apenas o texto/HTML de uma página ou endpoint.
             * @param {string} [url=CONFIG.API_ART_URL] - A URL destino.
             * @param {string} [metodo="GET"] - O método HTTP.
             * @param {string|FormData|Object} [dados=null] - O payload da requisição.
             * @param {Object} [headers={}] - Headers customizados.
             * @returns {Promise<string>} O conteúdo textual da resposta.
             */
            fetchText(url = CONFIG.API_ART_URL, metodo = "GET", dados = null, headers = {}) {
                return this.fetchAsync(url, metodo, dados, headers).then(r => r.responseText);
            },

            /**
             * Fábrica de Filas (Queues) para impedir o bloqueio por excesso de requisições no CREA.
             * @param {number} maxConcurrent - Número máximo de requisições simultâneas.
             * @returns {Object} Um gerenciador de fila de tarefas.
             */
            createQueue(maxConcurrent = 3) {
                return {
                    items: [],
                    active: 0,
                    max: maxConcurrent,
                    add(taskFn) {
                        this.items.push(taskFn);
                        this.next();
                    },
                    next() {
                        if (this.active >= this.max || !this.items.length) return;
                        const taskFn = this.items.shift();
                        this.active++;
                        taskFn().finally(() => {
                            this.active--;
                            this.next();
                        });
                    }
                };
            }
        },

        /**
         * Módulo da API Local: Integração com o Backend Local (Python/FastAPI).
         */
        apiLocal: {
            async consultarRmo(idRmo) {
                return await _fazerRequisicaoApiLocal('GET', `/api/consultar/${idRmo}`, null, true);
            },

            async processarRmo(dadosRmo) {
                const statusPermitidos = ["Regular", "Irregular", "Informações Insuficientes"];
                if (!statusPermitidos.includes(dadosRmo.status)) {
                    const msgErro = `Status recusado pelo client: '${dadosRmo.status}'.`;
                    Log.error("CommAPILocal", msgErro, { statusEnviado: dadosRmo.status });
                    if(UI.toast) UI.toast.warning(`Status "${dadosRmo.status}" não é aceito.`);
                    throw new Error(msgErro);
                }
                return await _fazerRequisicaoApiLocal('POST', '/api/processar', dadosRmo);
            },

            async consultarLoteRmos(ids) {
                return await _fazerRequisicaoApiLocal('POST', '/api/consultar_lote', { ids_rmo: ids });
            },

            async listarRmosVerificadas() {
                return await _fazerRequisicaoApiLocal('GET', '/api/listar_verificados');
            },

            async baixarPdfArt(idRmo, numeroArt, urlArt) {
                const payload = { id_rmo: idRmo, numero_art: numeroArt, url_art: urlArt };
                return await _fazerRequisicaoApiLocal('POST', '/api/baixar_art', payload);
            }
        }
    };

    window.Comm = CommBridge;
})();
