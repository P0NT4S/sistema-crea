/* ==========================================================================
   MÓDULO DE DOMÍNIO (Domain Layer)
   Responsabilidade: Definir os contratos, modelos de dados e regras de negócio
   puras do contexto de Registro de RMOs.
   ========================================================================== */

/* ==============================
   CONFIGURAÇÕES DO MÓDULO
   ============================== */

/**
 * @constant {string[]} STATUS_PERMITIDOS
 * @description Lista canônica de status aceitos pela API local.
 * Centralizada aqui para evitar strings hardcoded espalhadas pelo código.
 */
const STATUS_PERMITIDOS = ['Regular', 'Irregular', 'Informações Insuficientes'];


/* ==========================================================================
   VALUE OBJECT: StatusRmo
   ========================================================================== */

/**
 * @class StatusRmo
 * @description Value Object imutável que encapsula o status de fiscalização de uma RMO
 * e concentra todas as regras de validação associadas a esse campo.
 *
 * @example
 * const status = new StatusRmo('Irregular');
 * status.exigeDescricao(); // true
 *
 * const statusRegular = new StatusRmo('Regular');
 * statusRegular.exigeDescricao(); // false
 */
class StatusRmo {
    /**
     * @param {string} valor - Um dos valores de STATUS_PERMITIDOS.
     */
    constructor(valor) {
        if (valor && !STATUS_PERMITIDOS.includes(valor)) {
            throw new Error(`[StatusRmo] Valor inválido: "${valor}". Aceitos: ${STATUS_PERMITIDOS.join(', ')}`);
        }
        this._valor = valor || null;
    }

    /** @returns {string|null} O valor canônico do status. */
    get valor() {
        return this._valor;
    }

    /**
     * Indica se este status exige uma descrição preenchida para ser válido.
     * Regra de negócio: Apenas "Irregular" impõe essa restrição.
     * @returns {boolean}
     */
    exigeDescricao() {
        return this._valor === 'Irregular';
    }

    /**
     * Indica se o status foi selecionado (não é nulo ou vazio).
     * @returns {boolean}
     */
    estaDefinido() {
        return this._valor !== null && this._valor !== '';
    }

    /**
     * Retorna a lista canônica de status válidos para popular um <select>.
     * @static
     * @returns {string[]}
     */
    static obterOpcoes() {
        return [...STATUS_PERMITIDOS];
    }
}


/* ==========================================================================
   MODEL: RmoRegistroModel
   ========================================================================== */

/**
 * @class RmoRegistroModel
 * @description Representa o estado completo de um registro de RMO em memória.
 * É a "fonte da verdade" do estado da aplicação — o Controller atualiza este modelo,
 * e a GUI o lê para renderizar.
 */
class RmoRegistroModel {
    /**
     * @param {string|null} idRmo - ID numérico da RMO identificada na página.
     */
    constructor(idRmo = null) {
        this.idRmo     = idRmo;
        this.fiscal    = '---';
        this.status    = new StatusRmo(null); // Começa sem status selecionado
        this.descricao = '';
        this.carregado = false; // Flag: indica se os dados já vieram da API
    }

    /**
     * Atualiza o modelo com os dados retornados pela API.
     * @param {{ fiscal: string, status: string, descricao: string }|null} dadosApi
     */
    aplicarDadosApi(dadosApi) {
        if (!dadosApi) {
            // RMO nova (não registrada anteriormente)
            this.status    = new StatusRmo(null);
            this.descricao = '';
        } else {
            this.fiscal    = dadosApi.fiscal   || '---';
            this.status    = new StatusRmo(dadosApi.status   || null);
            this.descricao = dadosApi.descricao || '';
        }
        this.carregado = true;
    }

    /**
     * Verifica se o modelo é válido para ser submetido à API.
     * Centraliza a regra de negócio que antes estava inline na GUI.
     * @returns {boolean}
     */
    estaValido() {
        if (!this.status.estaDefinido()) return false;
        if (this.status.exigeDescricao() && this.descricao.trim() === '') return false;
        return true;
    }
}


/* ==========================================================================
   DTO: PayloadRegistroRmo
   ========================================================================== */

/**
 * @class PayloadRegistroRmo
 * @description Data Transfer Object (DTO) responsável por montar o contrato de envio
 * para a API local (`CommBridge.apiLocal.processarRmo`).
 * Garante que apenas dados válidos e no formato esperado pelo backend sejam trafegados.
 *
 * @example
 * const payload = new PayloadRegistroRmo(model).serializar();
 * await commBridge.apiLocal.processarRmo(payload);
 */
class PayloadRegistroRmo {
    /**
     * @param {RmoRegistroModel} modelo - O estado atual da aplicação.
     */
    constructor(modelo) {
        if (!(modelo instanceof RmoRegistroModel)) {
            throw new Error('[PayloadRegistroRmo] Requer uma instância de RmoRegistroModel.');
        }
        this._modelo = modelo;
    }

    /**
     * Serializa o modelo para o formato JSON esperado pela API.
     * O campo `rts` é mantido como objeto vazio para compatibilidade com o contrato existente.
     * @returns {{ id_rmo: string, status: string, descricao: string, rts: Object }}
     */
    serializar() {
        return {
            id_rmo:   this._modelo.idRmo,
            status:   this._modelo.status.valor,
            descricao: this._modelo.descricao.trim(),
            rts:      {} // Campo obrigatório pelo contrato da API (uso futuro)
        };
    }
}
