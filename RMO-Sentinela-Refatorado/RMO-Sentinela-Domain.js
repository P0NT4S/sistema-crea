/* ==========================================================================
   MÓDULO DE DOMÍNIO (Domain Layer)
   Responsabilidade: Definir os modelos de dados e regras de negócio puras
   do contexto de monitoramento de RMOs (Sentinela).
   ========================================================================== */

/* ==========================================================================
   VALUE OBJECT: StatusRmo
   ========================================================================== */

/**
 * @class StatusRmo
 * @description Value Object que encapsula o status de fiscalização de uma RMO.
 */
class StatusRmo {
    /**
     * @type {string[]}
     * @description Lista canônica de status aceitos pela API local de RMO.
     */
    static STATUS_PERMITIDOS = ['Regular', 'Irregular', 'Informações Insuficientes'];

    /**
     * @param {string} valor - Um dos valores de StatusRmo.STATUS_PERMITIDOS.
     */
    constructor(valor) {
        if (valor && !StatusRmo.STATUS_PERMITIDOS.includes(valor)) {
            throw new Error(`[StatusRmo] Valor inválido: "${valor}". Aceitos: ${StatusRmo.STATUS_PERMITIDOS.join(', ')}`);
        }
        this._valor = valor || null;
    }

    /** @returns {string|null} O valor textual do status. */
    get valor() {
        return this._valor;
    }

    /**
     * Verifica se o status está definido (não nulo).
     * @returns {boolean}
     */
    verificaStatus() {
        return this._valor !== null;
    }
}

/* ==========================================================================
   MODEL: RmoSentinelaItem
   ========================================================================== */

/**
 * @class RmoSentinelaItem
 * @description Representa um item de RMO detectado na listagem, associando o ID
 * às suas respectivas linhas físicas no DOM (tabela).
 */
class RmoSentinelaItem {
    /**
     * @param {string} id - Código identificador da RMO (ex: 2026RMO0001).
     */
    constructor(id) {
        if (!id) throw new Error('[RmoSentinelaItem] ID da RMO é obrigatório.');
        this._id = id;
        this._linhasDom = [];
        this._status = new StatusRmo(null);
        this._descricao = '';
    }

    /** @returns {string} */
    get id() {
        return this._id;
    }

    /** @returns {HTMLTableRowElement[]} */
    get linhasDom() {
        return this._linhasDom;
    }

    /** @returns {StatusRmo} */
    get status() {
        return this._status;
    }

    /** @returns {string} */
    get descricao() {
        return this._descricao;
    }

    /**
     * Associa uma nova linha física da tabela a este item de RMO.
     * @param {HTMLTableRowElement} linha - Elemento TR do DOM.
     */
    adicionarLinhaDom(linha) {
        if (linha && !this._linhasDom.includes(linha)) {
            this._linhasDom.push(linha);
        }
    }

    /**
     * Atualiza o resultado de fiscalização da RMO com dados vindos da API.
     * @param {string} status - Status retornado pela API.
     * @param {string} descricao - Justificativa ou observação.
     */
    atualizarResultado(status, descricao) {
        this._status = new StatusRmo(status);
        this._descricao = descricao || 'Sem descrição informada.';
    }
}

/* ==========================================================================
   MODEL: RmoSentinelaModel
   ========================================================================== */

/**
 * @class RmoSentinelaModel
 * @description Agregador que gerencia a coleção de itens RmoSentinelaItem
 * detectados na varredura da página corrente.
 */
class RmoSentinelaModel {
    constructor() {
        /** @type {Map<string, RmoSentinelaItem>} */
        this._itens = new Map();
    }

    /** @returns {RmoSentinelaItem[]} */
    get itens() {
        return Array.from(this._itens.values());
    }

    /**
     * Limpa o estado interno do modelo.
     */
    limpar() {
        this._itens.clear();
    }

    /**
     * Registra uma ocorrência de linha TR para um determinado ID de RMO.
     * Se o item ainda não existir no modelo, ele é instanciado.
     * @param {string} id - ID da RMO.
     * @param {HTMLTableRowElement} linhaDom - Elemento TR correspondente.
     */
    registrarRmoLinha(id, linhaDom) {
        if (!this._itens.has(id)) {
            this._itens.set(id, new RmoSentinelaItem(id));
        }
        this._itens.get(id).adicionarLinhaDom(linhaDom);
    }

    /**
     * Retorna a lista de IDs de RMO únicos coletados para consulta.
     * @returns {string[]}
     */
    obterIdsUnicos() {
        return Array.from(this._itens.keys());
    }

    /**
     * Atualiza os dados de status e descrição de um item específico a partir do seu ID.
     * @param {string} id - ID da RMO.
     * @param {string} status - Status recebido.
     * @param {string} descricao - Descrição recebida.
     */
    atualizarItem(id, status, descricao) {
        const item = this._itens.get(id);
        if (item) {
            item.atualizarResultado(status, descricao);
        }
    }
}
