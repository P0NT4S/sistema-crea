// ==UserScript==
// @name         Communication Bridge (HTTP API & ART - OOP)
// @namespace    https://github.com/P0NT4S/
// @version      5.0.0
// @description  Camada de comunicação refatorada para Classes ES6 (Padrão SaaS). Integração limpa e Injeção de Dependência nativa.
// @author       P0nt4s
// @grant        GM_xmlhttpRequest
// ==/UserScript==

/**
 * @class CreaAPI
 * @description Especialista em se comunicar com os servidores oficiais do CREA.
 * Lida com contorno de CORS e enfileiramento de requisições para evitar rate-limits.
 */
class CreaAPI {
    constructor(bridge) {
        this.bridge = bridge; // Referência à classe pai (CommBridge) para acessar configs e logs
    }

    /**
     * Faz uma requisição HTTP assíncrona burlando o CORS usando a API do Tampermonkey.
     */
    fetchAsync(url = this.bridge.urlBaseArt, metodo = "GET", dados = null, headers = {}) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest === "undefined") {
                this.bridge.log.error("CreaAPI", "GM_xmlhttpRequest não definido. Falta @grant no cabeçalho?");
                return reject(new Error("GM_xmlhttpRequest ausente."));
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
    }

    /**
     * Atalho prático para buscar apenas o texto/HTML de uma página.
     */
    fetchText(url = this.bridge.urlBaseArt, metodo = "GET", dados = null, headers = {}) {
        return this.fetchAsync(url, metodo, dados, headers).then(r => r.responseText);
    }

    /**
     * Fábrica de Filas (Queues) para impedir o bloqueio por excesso de requisições.
     */
    createQueue(maxConcurrent = 3) {
        return {
            items: [],
            active: 0,
            max: maxConcurrent,
            add: function(taskFn) {
                this.items.push(taskFn);
                this.next();
            },
            next: function() {
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
}

/**
 * @class LocalAPI
 * @description Especialista em se comunicar com o seu Backend (FastAPI/Python).
 */
class LocalAPI {
    constructor(bridge) {
        this.bridge = bridge;
    }

    /**
     * Motor interno padronizado para a API Local.
     * @private
     */
    _fazerRequisicao(metodo, endpoint, dados = null, ignorar404 = false) {
        const url = `${this.bridge.config.API_LOCAL_URL}${endpoint}`;
        const logContext = "CommAPILocal";
        
        return new Promise((resolve, reject) => {
            const opcoes = {
                method: metodo,
                url: url,
                headers: dados ? this.bridge.config.HEADERS_PADRAO : {},
                onload: (resposta) => {
                    if (resposta.status === 404 && ignorar404) {
                        this.bridge.log.info(logContext, `Recurso não encontrado (404): ${endpoint}`);
                        return resolve(null);
                    }

                    if (resposta.status < 200 || resposta.status >= 300) {
                        let msg = `Erro no servidor (Status ${resposta.status})`;
                        try {
                            const erroJson = JSON.parse(resposta.responseText);
                            if (erroJson && erroJson.detail) {
                                msg = Array.isArray(erroJson.detail) 
                                    ? "Dados inválidos: " + erroJson.detail.map(e => e.msg).join(", ") 
                                    : erroJson.detail; 
                            }
                        } catch (e) {
                            this.bridge.log.warning(logContext, "O erro do backend não é um JSON válido.", resposta.responseText);
                        }

                        this.bridge.log.error(logContext, `Erro [${metodo}] ${endpoint}`, { status: resposta.status, msg: msg });
                        return reject(new Error(msg));
                    }

                    try {
                        const json = JSON.parse(resposta.responseText);
                        this.bridge.log.success(logContext, `Sucesso [${metodo}] ${endpoint}`);
                        resolve(json);
                    } catch (e) {
                        this.bridge.log.error(logContext, "Falha ao processar JSON.", e);
                        reject(new Error("Falha ao processar resposta JSON."));
                    }
                },
                onerror: (erro) => {
                    this.bridge.log.error(logContext, `Falha de rede [${metodo}] ${endpoint}`, erro);
                    if (this.bridge.ui) this.bridge.ui.error("Falha de comunicação com o servidor local.");
                    reject(new Error("NetworkError"));
                }
            };

            if (dados) opcoes.data = JSON.stringify(dados);
            GM_xmlhttpRequest(opcoes);
        });
    }

    async consultarRmo(idRmo) {
        return await this._fazerRequisicao('GET', `/api/consultar/${idRmo}`, null, true);
    }

    async processarRmo(dadosRmo) {
        const statusPermitidos = ["Regular", "Irregular", "Informações Insuficientes"];
        if (!statusPermitidos.includes(dadosRmo.status)) {
            const msgErro = `Status recusado pelo client: '${dadosRmo.status}'.`;
            this.bridge.log.error("CommAPILocal", msgErro, { statusEnviado: dadosRmo.status });
            if (this.bridge.ui) this.bridge.ui.warning(`Status "${dadosRmo.status}" não é aceito.`);
            throw new Error(msgErro);
        }
        return await this._fazerRequisicao('POST', '/api/processar', dadosRmo);
    }

    async consultarLoteRmos(ids) {
        return await this._fazerRequisicao('POST', '/api/consultar_lote', { ids_rmo: ids });
    }

    async listarRmosVerificadas() {
        return await this._fazerRequisicao('GET', '/api/listar_verificados');
    }

    async baixarPdfArt(idRmo, numeroArt, urlArt) {
        const payload = { id_rmo: idRmo, numero_art: numeroArt, url_art: urlArt };
        return await this._fazerRequisicao('POST', '/api/baixar_art', payload);
    }
}

/**
 * @class CommBridge
 * @description O Ponto de Entrada (Facade) da camada de rede.
 * Instancia os submódulos de comunicação (CREA e Backend Local) injetando as dependências.
 */
class CommBridge {
    /**
     * @param {CoreUtils} coreUtils - Instância obrigatória para o sistema de Logs.
     * @param {UIFacade} [uiFacade=null] - Instância opcional para disparar Toasts visuais em caso de erro de rede.
     */
    constructor(coreUtils, uiFacade = null) {
        if (!coreUtils) throw new Error("[CommBridge] Erro Fatal: CoreUtils é obrigatório.");
        
        this.core = coreUtils;
        this.log = coreUtils.log;
        this.ui = uiFacade;

        // Configurações de Rede e Ambiente
        this.config = {
            MODO_TESTE: true,
            API_LOCAL_URL: 'http://127.0.0.1:6969',
            URLS_ART: {
                PRODUCAO: 'https://art.creadf.org.br/art1025/publico/consultas_ret.php',
                TESTE: 'http://localhost:8989'
            },
            HEADERS_PADRAO: { 'Content-Type': 'application/json' }
        };

        // Instancia os submódulos passando o escopo atual (this)
        this.apiART = new CreaAPI(this);
        this.apiLocal = new LocalAPI(this);
    }

    /**
     * Alterna o direcionamento das URLs da API do CREA.
     */
    definirModoTeste(status) {
        this.config.MODO_TESTE = !!status;
        this.log.warning("CommBridge", `Ambiente alterado. Modo de Teste: ${this.config.MODO_TESTE}`);
    }

    /**
     * Retorna a URL base do CREA dinamicamente.
     */
    get urlBaseArt() {
        return this.config.MODO_TESTE ? this.config.URLS_ART.TESTE : this.config.URLS_ART.PRODUCAO;
    }
}