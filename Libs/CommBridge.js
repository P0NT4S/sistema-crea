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
        this._tokenCache = null; // Cache do token Basic Auth em memória
        this._iniciarSniffer(); // Inicia interceptação passiva de segurança
    }

    /**
     * Intercepta requisições nativas do portal para capturar o header Authorization em tempo real.
     * @private
     */
    _iniciarSniffer() {
        const self = this;
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSetHeader = XMLHttpRequest.prototype.setRequestHeader;

        XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
            if (header.toLowerCase() === 'authorization' && value.startsWith('Basic ')) {
                if (!self._tokenCache) {
                    self._tokenCache = value;
                    self.bridge.log.success("CreaAPI", "Credenciais interceptadas em tempo real (Sniffer).");
                }
            }
            return originalSetHeader.apply(this, arguments);
        };
    }

    /**
     * Tenta extrair o token de autenticação do banco de dados IndexedDB do Ionic (_ionickv).
     * @private
     * @returns {Promise<string|null>} O token formatado em "Basic Om..." ou null.
     */
    async _extrairTokenDoIndexedDB() {
        if (this._tokenCache) return this._tokenCache;

        // Fallback 1: Local Storage (Mais rápido, mas menos provável no Ionic)
        const tokenLocal = localStorage.getItem('token') || localStorage.getItem('auth_token');
        if (tokenLocal) {
            this._tokenCache = tokenLocal.startsWith('Basic ') ? tokenLocal : "Basic " + btoa(":" + tokenLocal);
            this.bridge.log.info("CreaAPI", "Credenciais recuperadas via LocalStorage.");
            return this._tokenCache;
        }

        return new Promise((resolve) => {
            try {
                // Tenta abrir o banco de dados específico do Ionic/CREA
                const request = indexedDB.open("_ionickv");

                request.onerror = () => {
                    this.bridge.log.warning("CreaAPI", "Falha ao abrir IndexedDB _ionickv. Usando apenas fallbacks básicos.");
                    resolve(null);
                };

                request.onsuccess = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains("keyvaluepairs")) {
                        db.close();
                        return resolve(null);
                    }

                    const transaction = db.transaction(["keyvaluepairs"], "readonly");
                    const store = transaction.objectStore("keyvaluepairs");
                    const getRequest = store.get("token");

                    getRequest.onsuccess = () => {
                        const tokenPuro = getRequest.result;
                        if (tokenPuro && typeof tokenPuro === 'string') {
                            // A mágica: Adiciona o ":" e converte para Base64 (Padrão Basic Auth do Portal)
                            this._tokenCache = "Basic " + btoa(":" + tokenPuro);
                            this.bridge.log.success("CreaAPI", "Credenciais extraídas do banco _ionickv com sucesso.");
                            resolve(this._tokenCache);
                        } else {
                            resolve(null);
                        }
                        db.close();
                    };

                    getRequest.onerror = () => {
                        db.close();
                        resolve(null);
                    };
                };
            } catch (e) {
                this.bridge.log.error("CreaAPI", "Erro catastrófico ao acessar IndexedDB.", e);
                resolve(null);
            }
        });
    }

    /**
     * Faz uma requisição HTTP assíncrona burlando o CORS usando a API do Tampermonkey.
     */
    async fetchAsync(url = this.bridge.urlBaseArt, metodo = "GET", dados = null, headers = {}) {
        // Se for uma URL do CREA, tenta injetar o token de autorização automaticamente
        if (url.includes('creadf.org.br')) {
            const token = await this._extrairTokenDoIndexedDB();
            if (token && !headers['Authorization']) {
                headers['Authorization'] = token;
            }
        }

        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest === "undefined") {
                this.bridge.log.error("CreaAPI", "GM_xmlhttpRequest não definido. Falta @grant no cabeçalho?");
                return reject(new Error("GM_xmlhttpRequest ausente."));
            }
            
            // Headers refinados para máxima compatibilidade e evitar 403
            const headersPadrao = {
                'User-Agent': navigator.userAgent,
                'Accept': 'application/json, text/plain, */*',
                'X-Requested-With': 'XMLHttpRequest'
            };

            // Para URLs do Mobile, o Referer é obrigatório e validado pelo servidor
            if (url.includes('mobile.creadf.org.br')) {
                headersPadrao['Referer'] = 'https://mobile.creadf.org.br/sgf_web_21/www/';
            }

            const opcoes = {
                method: metodo,
                url: url,
                headers: { ...headersPadrao, ...headers },
                onload: r => {
                    if (r.status >= 200 && r.status < 400) {
                        resolve(r);
                    } else {
                        if (r.status === 403) {
                            this.bridge.log.error("CreaAPI", "Erro 403: Acesso negado. Verifique se você está logado no portal corporativo.");
                        }
                        reject(new Error(`HTTP ${r.status}`));
                    }
                },
                onerror: (e) => reject(new Error("Falha na conexão de rede.")),
                ontimeout: () => reject(new Error("Tempo de requisição esgotado."))
            };

            if (dados) {
                if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
                    opcoes.data = dados;
                } else {
                    opcoes.data = typeof dados === 'string' ? dados : JSON.stringify(dados);
                }
            }
            
            GM_xmlhttpRequest(opcoes);
        });
    }

    /**
     * Atalho prático para buscar apenas o texto/HTML de uma página.
     */
    async fetchText(url = this.bridge.urlBaseArt, metodo = "GET", dados = null, headers = {}) {
        const r = await this.fetchAsync(url, metodo, dados, headers);
        return r.responseText;
    }

    /**
     * Busca dados no Portal Corporativo (API Mobile).
     * @param {string} campo - 'registro', 'cpf_cnpj' ou 'nome'.
     * @param {string} valor - O valor a ser pesquisado.
     */
    async buscarCorporativo(campo, valor) {
        const url = `https://mobile.creadf.org.br/sgf_web_21/ws/busca_corp?campo=${campo}&valor=${encodeURIComponent(valor)}`;
        const res = await this.fetchAsync(url, "GET");
        
        try {
            return JSON.parse(res.responseText);
        } catch (e) {
            this.bridge.log.error("CreaAPI", "Falha ao processar JSON corporativo.", res.responseText.substring(0, 200));
            throw new Error("O servidor corporativo não retornou um formato JSON válido.");
        }
    }

    /**
     * Gera a requisição de impressão de uma ART.
     * @param {string} numeroArt - Número da ART (13 dígitos).
     */
    async gerarImpressaoArt(numeroArt) {
        const url = 'https://art.creadf.org.br/art1025/funcoes/form_impressao_tos.php';
        const payload = `rnp_ficha_intranet=1&NUMERO_DA_ART=${numeroArt}&envia=Consultar ART`;
        const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        
        return await this.fetchAsync(url, "POST", payload, headers);
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
 * @class PublicAPI
 * @description Especialista em consumir APIs públicas externas (ex: BrasilAPI).
 */
class PublicAPI {
    constructor(bridge) {
        this.bridge = bridge;
    }

    /**
     * Consulta dados de um CNPJ na BrasilAPI.
     * @param {string} cnpj - CNPJ apenas números.
     */
    async consultarCnpj(cnpj) {
        const url = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
        try {
            const res = await this.bridge.apiART.fetchAsync(url);
            return JSON.parse(res.responseText);
        } catch (e) {
            this.bridge.log.error("PublicAPI", `Falha ao consultar CNPJ ${cnpj}`, e);
            throw e;
        }
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
            MODO_TESTE: false,
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
        this.apiPublica = new PublicAPI(this);
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