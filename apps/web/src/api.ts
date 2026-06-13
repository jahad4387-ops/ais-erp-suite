const API_BASE = '/api';
const TOKEN_KEY = 'ais.accessToken';
const USER_KEY = 'ais.currentUserId';

const errorMessageText: Record<string, string> = {
  'Username or password is invalid.': '用户名或密码错误。',
  'Write requests must include Idempotency-Key.': '写入请求缺少幂等键，请刷新页面后重试。',
  'Role name already exists.': '角色名称已存在。',
  'At least one role must keep role.manage permission.': '至少需要保留一个拥有“管理角色”权限的角色，避免系统被锁定。',
  'Username already exists.': '用户名已存在。',
  'User was not found.': '未找到用户。',
  'System administrator user cannot be deleted.': '系统管理员用户不能删除。',
  'Current signed-in user cannot be deleted.': '当前登录用户不能删除。',
  'Role was not found.': '未找到角色。',
  'Account set was not found.': '未找到账套。',
  'Enabled account sets do not allow master data or opening balance changes.':
    '当前账套已启用，不能再修改科目、辅助核算或期初余额等初始化数据。请先在账套管理中停用该账套，或新建未启用账套完成初始化。',
  'Enabled account sets do not allow start year or start period changes.':
    '当前账套已启用，不能修改启用年度或启用期间。',
  'Use /account-sets/{accountSetId}/periods/generate.': '请使用账套下的会计期间生成接口。',
  'Accounting period was not found.': '未找到会计期间。',
  'Locked periods cannot be opened.': '已锁定的会计期间不能打开。',
  'Only open periods can be closed.': '只有开放状态的会计期间可以关闭。',
  'Current accounting period must be open.': '当前会计期间必须是开放状态。',
  'Account was not found.': '未找到会计科目。',
  'Accounts referenced by vouchers cannot be deleted.': '会计科目已被凭证引用，不能删除。',
  'Auxiliary type code already exists.': '辅助类型编码已存在。',
  'Auxiliary type was not found.': '未找到辅助类型。',
  'Auxiliary item code already exists.': '辅助项目编码已存在。',
  'Auxiliary item was not found.': '未找到辅助项目。',
  'Opening balance amounts must be non-negative numbers.': '期初余额金额必须是非负数。',
  'Opening balance cannot contain both debit and credit.': '同一条期初余额不能同时填写借方和贷方。',
  'Profit and loss carry-forward voucher already exists.': '该期间损益结转凭证已存在。',
  'Voucher was not found.': '未找到凭证。',
  'Only draft or rejected vouchers can be updated.': '只有草稿或已驳回凭证可以修改。',
  'Only draft or rejected vouchers can be submitted.': '只有草稿或已驳回凭证可以提交。',
  'Only submitted vouchers can be approved.': '只有已提交凭证可以审核。',
  'Voucher creator cannot approve their own voucher.': '制单人不能审核自己创建的凭证。',
  'Only balanced vouchers can be approved.': '只有借贷平衡的凭证可以审核。',
  'Voucher is already posted.': '凭证已记账。',
  'Only approved vouchers can be posted.': '只有已审核凭证可以记账。',
  'Only submitted vouchers can be rejected.': '只有已提交凭证可以驳回。',
  'Only draft, submitted, or rejected vouchers can be voided.': '只有草稿、已提交或已驳回凭证可以作废。',
  'Only posted vouchers can be reversed.': '只有已记账凭证可以冲销。',
  'Voucher must contain at least two lines.': '凭证至少需要两条分录。',
  'Voucher must contain at least one line.': '凭证至少需要一条分录。',
  'Voucher period must be open.': '凭证所属会计期间必须打开。',
  'Voucher must belong to the supplied accounting period.': '凭证必须属于指定的会计期间。',
  'Voucher line amounts must be finite numbers.': '凭证分录金额必须是有效数字。',
  'Voucher line amounts cannot be negative.': '凭证分录金额不能为负数。',
  'Voucher line cannot contain both debit and credit amounts.': '同一凭证分录不能同时填写借方和贷方金额。',
  'Voucher line must contain a debit or credit amount.': '凭证分录必须填写借方或贷方金额。',
  'normalBalance must be debit or credit.': '余额方向必须是借方或贷方。',
  'segments are required.': '请填写科目编码分段规则。',
  'segments must contain positive integers.': '科目编码分段必须是正整数。',
  'Voucher does not belong to the posting batch period.': '凭证不属于当前记账批次期间。',
  'Posting batch was not found.': '未找到记账批次。',
  'Bank account was not found.': '未找到银行科目。',
  'Bank statement import requires an account marked as bank.': '银行流水导入必须选择标记为银行的科目。',
  'Bank reconciliation was not found.': '未找到银行对账记录。',
  'Attachment was not found.': '未找到附件。',
  'Only available attachments can be linked.': '只能关联状态可用的附件。',
  'Attachment content is not stored in local object storage.': '附件内容未存储在本地对象存储中。',
  'Attachment content was not found.': '未找到附件内容。',
  'Posted voucher attachments cannot be deleted.': '已记账凭证的附件不能删除。',
  'Attachment cannot be deleted before its retention policy expires.': '附件保留期未到，不能删除。',
  'External attachment storage requires pre-uploaded object metadata instead of local binary content.':
    '外部附件存储需要预上传对象元数据，不能直接上传本地文件内容。',
  'contentBase64 must be a non-empty base64 string when provided.': '附件内容必须是非空 Base64 字符串。',
  'Uploaded attachment checksum does not match content.': '上传附件校验值与内容不匹配。',
  'External attachment storage requires explicit storageProvider external and storageKey metadata.':
    '外部附件存储必须提供 storageProvider=external 和 storageKey 元数据。',
  'External attachment storage requires a sha256 checksum for object integrity verification.':
    '外部附件存储必须提供 sha256 校验值用于完整性校验。',
  'External attachment object was not found in the configured storage service.': '外部存储服务中未找到该附件对象。',
  'External attachment object size does not match metadata.': '外部附件对象大小与元数据不一致。',
  'External attachment object checksum does not match metadata.': '外部附件对象校验值与元数据不一致。',
  'AI voucher suggestions must use dryRun true.': '智能凭证建议必须先以试运行方式生成。',
  'AI voucher draft attachments must exist, belong to the account set, and be available.':
    '智能凭证附件必须存在、属于当前账套且状态可用。',
  'AI voucher suggestion was not found.': '未找到智能凭证建议。',
  'AI voucher suggestion has already been converted.': '智能凭证建议已转换为凭证。',
  'No profit and loss activity exists for the supplied period.': '该期间没有需要结转的损益发生额。',
};

const errorCodeText: Record<string, string> = {
  INVALID_CREDENTIALS: '用户名或密码错误。',
  IDEMPOTENCY_KEY_REQUIRED: '写入请求缺少幂等键，请刷新页面后重试。',
  PERMISSION_DENIED: '权限不足，无法执行该操作。',
  ACCOUNT_SET_ACCESS_DENIED: '当前用户无权访问该账套。',
  ACCOUNT_SET_ENABLED_LOCKED:
    '当前账套已启用，不能再修改初始化数据。请先停用账套，或新建未启用账套完成初始化。',
  ACCOUNT_SET_NOT_FOUND: '未找到账套。',
  PERIOD_NOT_FOUND: '未找到会计期间。',
  PERIOD_CLOSE_BLOCKED: '仍有未记账凭证，不能关闭会计期间。',
  PERIOD_CLOSE_CARRY_FORWARD_EXISTS: '该期间损益结转凭证已存在。',
  ACCOUNT_NOT_FOUND: '未找到会计科目。',
  ACCOUNT_IN_USE: '会计科目已被凭证引用，不能删除。',
  AUXILIARY_TYPE_ALREADY_EXISTS: '辅助类型编码已存在。',
  AUXILIARY_TYPE_NOT_FOUND: '未找到辅助类型。',
  AUXILIARY_ITEM_ALREADY_EXISTS: '辅助项目编码已存在。',
  AUXILIARY_ITEM_NOT_FOUND: '未找到辅助项目。',
  PARTNER_CODE_EXISTS: '往来单位编码已存在，请换一个编码，或编辑已有的供应商/客户档案。',
  INVENTORY_ITEM_CODE_EXISTS: '存货编码已存在，请换一个编码。',
  BATCH_COST_METHOD_CONFLICT: '批次管理的存货不能使用移动平均计价，请选择先进先出或个别计价。',
  VOUCHER_PERIOD_CLOSED: '凭证所属会计期间必须先打开。',
  AGENT_DRAFT_PERIOD_CLOSED: '会计期间已关闭或锁定，不能生成影响库存或成本的 Agent 草稿。',
  AGENT_ACTION_BLOCKED_BY_DRY_RUN: 'Agent 试算仍有阻断项，不能执行。',
  AGENT_ACTION_EXECUTION_PAYLOAD_INVALID: 'Agent 试算结果缺少可执行的业务数据。',
  AGENT_ACTION_REVERSAL_TARGET_INVALID: '无法确认 Agent 创建的业务草稿，不能自动撤销。',
  AGENT_ACTION_REVERSAL_BLOCKED: '业务草稿已被下达或修改，不能由 Agent 自动撤销。',
  VOUCHER_ATTACHMENT_NOT_AVAILABLE: '凭证附件未就绪，不能记账。',
  VOUCHER_NOT_FOUND: '未找到凭证。',
  VOUCHER_UPDATE_CONFLICT: '凭证已被其他用户修改，请刷新后重试。',
  VOUCHER_UPDATE_BLOCKED: '当前凭证状态不允许修改。',
  VOUCHER_DELETE_BLOCKED: '当前凭证状态不允许删除或作废。',
  VOUCHER_ALREADY_POSTED: '凭证已记账。',
  VOUCHER_POSTING_BLOCKED: '凭证不满足记账条件。',
  POSTING_BATCH_NOT_FOUND: '未找到记账批次。',
  BANK_ACCOUNT_NOT_FOUND: '未找到银行科目。',
  ACCOUNT_IS_NOT_BANK: '银行流水导入必须选择标记为银行的科目。',
  BANK_RECONCILIATION_NOT_FOUND: '未找到银行对账记录。',
  ATTACHMENT_EXTERNAL_STORAGE_REQUIRED: '外部附件存储需要预上传对象元数据。',
  ATTACHMENT_SIZE_MISMATCH: '上传附件大小与声明大小不一致。',
  ATTACHMENT_CHECKSUM_MISMATCH: '上传附件校验值与内容不匹配。',
  ATTACHMENT_EXTERNAL_METADATA_REQUIRED: '外部附件存储缺少对象元数据。',
  ATTACHMENT_EXTERNAL_CHECKSUM_REQUIRED: '外部附件存储缺少 sha256 校验值。',
  ATTACHMENT_EXTERNAL_OBJECT_NOT_FOUND: '外部存储服务中未找到该附件对象。',
  ATTACHMENT_EXTERNAL_SIZE_MISMATCH: '外部附件对象大小与元数据不一致。',
  ATTACHMENT_EXTERNAL_CHECKSUM_MISMATCH: '外部附件对象校验值与元数据不一致。',
  ATTACHMENT_NOT_FOUND: '未找到附件。',
  ATTACHMENT_NOT_AVAILABLE: '附件当前不可用。',
  ATTACHMENT_CONTENT_NOT_FOUND: '未找到附件内容。',
  POSTED_VOUCHER_ATTACHMENT_DELETE_BLOCKED: '已记账凭证的附件不能删除。',
  ATTACHMENT_RETENTION_DELETE_BLOCKED: '附件保留期未到，不能删除。',
  AI_ATTACHMENT_NOT_AVAILABLE: '智能凭证附件必须存在、属于当前账套且状态可用。',
  AI_SUGGESTION_NOT_FOUND: '未找到智能凭证建议。',
  AI_SUGGESTION_ALREADY_CONVERTED: '智能凭证建议已转换为凭证。',
  REPORT_PERIOD_CLOSED: '会计期间已结账，报表引擎不能重新计算。',
  REPORT_RUN_LOCKED: '报表已锁定，只能读取已保存的快照。',
  REPORT_CASH_FLOW_UNASSIGNED: '现金流量表存在未分配异常现金流，请补录现金流项目后再提交或锁定。',
  REPORT_TEMPLATE_VERSION_NOT_PUBLISHED: '只有已发布的报表模板版本可以运行。',
  REPORT_RUN_NOT_FOUND: '未找到报表运行记录。',
  RESTORE_DRILL_REQUIRED: '恢复演练必须在静默沙箱环境中执行。请设置 RESTORE_DRILL=true 或 AIS_RESTORE_DRILL=true 后重试。',
  RESTORE_DRY_RUN_REQUIRED: '恢复任务必须以 dry-run 方式执行。',
  BACKUP_JOB_NOT_FOUND: '未找到可用于该账套的备份任务。',
  ROLE_ALREADY_EXISTS: '角色名称已存在。',
  ROLE_MANAGER_REQUIRED: '至少需要保留一个拥有“管理角色”权限的角色，避免系统被锁定。',
  USER_ALREADY_EXISTS: '用户名已存在。',
  USER_NOT_FOUND: '未找到用户。',
  SYSTEM_USER_DELETE_BLOCKED: '系统管理员用户不能删除。',
  CURRENT_USER_DELETE_BLOCKED: '当前登录用户不能删除。',
  ROLE_NOT_FOUND: '未找到角色。',
  BUSINESS_RULE_FAILED: '业务规则校验失败。',
  NOT_FOUND: '未找到请求的资源。',
};

const requiredFieldText: Record<string, string> = {
  accountSet: '账套',
  accountSetId: '账套',
  actorId: '操作用户',
  bankAccountCode: '银行科目',
  baseCurrency: '本位币',
  byteSize: '附件大小',
  code: '编码',
  companyName: '公司名称',
  content: '业务内容',
  contentType: '附件类型',
  createdBy: '制单人',
  filename: '文件名',
  fiscalYear: '会计年度',
  line: '凭证分录',
  'line.accountCode': '分录科目',
  'line.summary': '分录摘要',
  name: '名称',
  objectId: '关联对象',
  objectType: '关联对象类型',
  password: '密码',
  period: '会计期间',
  periodNo: '会计期间',
  permissionCodes: '权限',
  profitLossAccountCode: '损益结转科目',
  reviewedBy: '复核人',
  rows: '导入数据',
  startPeriod: '启用期间',
  startYear: '启用年度',
  submittedBy: '提交人',
  username: '用户名',
  voucherDate: '凭证日期',
  voucherIds: '凭证',
};

const errorMessagePatterns: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^(.+) is required\.$/, (match) => `${requiredFieldText[match[1]] ?? match[1]}不能为空。`],
  [/^Actor .+ lacks .+\.$/, () => '权限不足，无法执行该操作。'],
  [/^Actor .+ cannot access account set .+\.$/, () => '当前用户无权访问该账套。'],
  [/^Voucher period must be open before .+\.$/, () => '凭证所属会计期间必须先打开。'],
  [/^(\d+) unposted vouchers remain\.$/, (match) => `仍有 ${match[1]} 张凭证未记账，不能关闭会计期间。`],
  [/^Period close blocked: (\d+) unposted vouchers remain\.$/, (match) => `仍有 ${match[1]} 张凭证未记账，不能关闭会计期间。`],
  [/^Account code (.+) does not match account code rule (.+)\.$/, (match) => `科目编码 ${match[1]} 不符合编码规则 ${match[2]}。`],
  [/^Account (.+) does not exist\.$/, (match) => `科目 ${match[1]} 不存在。`],
  [/^Account (.+) is disabled\.$/, (match) => `科目 ${match[1]} 已停用。`],
  [/^Account (.+) is not a leaf account\.$/, (match) => `科目 ${match[1]} 不是末级科目，不能直接使用。`],
  [/^Account (.+) does not allow manual entry\.$/, (match) => `科目 ${match[1]} 不允许手工录入。`],
  [/^Account (.+) requires auxiliary (.+)\.$/, (match) => `科目 ${match[1]} 需要填写辅助核算：${match[2]}。`],
  [/^Voucher was modified by another user\. Refresh and retry with revision (\d+)\.$/, (match) => `凭证已被其他用户修改，请刷新后用版本 ${match[1]} 重试。`],
  [/^Voucher attachments must be available before posting: (.+)\.$/, (match) => `凭证附件未就绪，不能记账：${match[1]}。`],
  [/^Uploaded attachment content is (\d+) bytes but byteSize declares (\d+)\.$/, (match) => `上传附件实际大小为 ${match[1]} 字节，与声明的 ${match[2]} 字节不一致。`],
  [/^No route for (.+)\.$/, () => '未找到请求的接口。'],
  [/^Unknown permission (.+)\.$/, (match) => `未知权限：${match[1]}。`],
  [/^Profit and loss carry-forward account (.+) does not exist\.$/, (match) => `损益结转科目 ${match[1]} 不存在。`],
];

function zhErrorMessage(message?: string, code?: string) {
  if (message && errorMessageText[message]) {
    return errorMessageText[message];
  }
  if (message) {
    for (const [pattern, translate] of errorMessagePatterns) {
      const match = message.match(pattern);
      if (match) {
        return translate(match);
      }
    }
  }
  if (code && errorCodeText[code]) {
    if (code === 'BUSINESS_RULE_FAILED' && message) {
      return message && !/[A-Za-z]/.test(message) ? message : `${errorCodeText[code]}：${message}`;
    }
    return errorCodeText[code];
  }
  return message && !/[A-Za-z]/.test(message) ? message : errorCodeText[code ?? ''] ?? '接口请求失败';
}

async function request(method: string, path: string, data?: any) {
  const headers: Record<string, string> = {
    'Actor-Id': localStorage.getItem(USER_KEY) ?? '',
  };
  const token = localStorage.getItem(TOKEN_KEY);

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (data !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (method !== 'GET' && path !== '/auth/login') {
    headers['Idempotency-Key'] = `web-req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });
  } catch (error) {
    throw new Error('网络请求失败，请检查后端服务是否已启动。', { cause: error });
  }

  const responseData = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(zhErrorMessage(responseData?.message, responseData?.code));
    (error as any).data = responseData;
    throw error;
  }

  return responseData;
}

export const api = {
  get: (path: string) => request('GET', path),
  post: (path: string, data?: any) => request('POST', path, data),
  patch: (path: string, data?: any) => request('PATCH', path, data),
  delete: (path: string, data?: any) => request('DELETE', path, data),
  login: (username: string, password: string) => request('POST', '/auth/login', { username, password }),
};

export const authStorage = {
  setSession(accessToken: string, userId: string) {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, userId);
  },
  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  currentUserId() {
    return localStorage.getItem(USER_KEY) ?? '';
  },
  hasSession() {
    return Boolean(localStorage.getItem(TOKEN_KEY) && localStorage.getItem(USER_KEY));
  },
};
