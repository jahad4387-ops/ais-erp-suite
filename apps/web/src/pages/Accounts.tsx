import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Select, Space, Switch, Table, Tag, message } from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ImportOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { accountTypeText, normalBalanceText, zhBool } from '../i18n';
import { standardAccountTemplates } from '../standardAccountTemplates';

type AccountRecord = {
  code: string;
  name: string;
  accountType: string;
  normalBalance: string;
  parentId?: string | null;
  isLeaf?: boolean;
  isCash?: boolean;
  isBank?: boolean;
  isEnabled?: boolean;
  allowManualEntry?: boolean;
  requiredAuxiliaries?: string[];
  children?: AccountRecord[];
};

type AccountFormValues = Omit<AccountRecord, 'requiredAuxiliaries'> & {
  requiredAuxiliaries?: string;
};

type AccountSetRecord = {
  id: string;
  status: string;
};

const accountTypeOptions = [
  { value: 'asset', label: '资产' },
  { value: 'liability', label: '负债' },
  { value: 'equity', label: '权益' },
  { value: 'cost', label: '成本' },
  { value: 'expense', label: '费用' },
  { value: 'revenue', label: '收入' },
];

const normalBalanceOptions = [
  { value: 'debit', label: '借方' },
  { value: 'credit', label: '贷方' },
];

const parseAuxiliaries = (value?: string) =>
  value
    ? value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  return ['true', 'yes', '1', 'y'].includes(value.trim().toLowerCase());
};

const flattenAccountCodes = (rows: AccountRecord[]): string[] =>
  rows.flatMap((row) => [row.code, ...(row.children ? flattenAccountCodes(row.children) : [])]);

const toImportAccountRow = (account: (typeof standardAccountTemplates)[number]): AccountRecord => ({
  code: account.code,
  name: account.name,
  accountType: account.accountType,
  normalBalance: account.normalBalance,
  isLeaf: account.isLeaf,
  isCash: account.isCash,
  isBank: account.isBank,
  allowManualEntry: account.allowManualEntry,
});

export const parseImportRows = (text: string): AccountRecord[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index) => !(index === 0 && line.toLowerCase().startsWith('code,')))
    .map((line) => {
      const [code, name, accountType = 'asset', normalBalance = 'debit', isLeaf, isCash, isBank, allowManualEntry] = line
        .split(',')
        .map((value) => value.trim());
      return {
        code,
        name,
        accountType,
        normalBalance,
        isLeaf: parseBoolean(isLeaf, true),
        isCash: parseBoolean(isCash, false),
        isBank: parseBoolean(isBank, false),
        allowManualEntry: parseBoolean(allowManualEntry, true),
      };
    })
    .filter((row) => row.code && row.name);

export const Accounts: React.FC = () => {
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [standardImportOpen, setStandardImportOpen] = useState(false);
  const [importText, setImportText] = useState('code,name,accountType,normalBalance,isLeaf,isCash,isBank,allowManualEntry');
  const [importPreviewRows, setImportPreviewRows] = useState<AccountRecord[]>([]);
  const [selectedStandardAccountCodes, setSelectedStandardAccountCodes] = useState<string[]>([]);
  const [standardAccountKeyword, setStandardAccountKeyword] = useState('');
  const [standardAccountTypeFilter, setStandardAccountTypeFilter] = useState<string>('all');
  const [editingAccount, setEditingAccount] = useState<AccountRecord | null>(null);
  const [currentAccountSetStatus, setCurrentAccountSetStatus] = useState<string>();
  const [form] = Form.useForm<AccountFormValues>();
  const { currentAccountSetId, currentUser } = useAppContext();
  const isAccountSetLocked = currentAccountSetStatus === 'enabled';
  const masterDataLockMessage =
    '当前账套已启用，科目主数据已锁定。如需导入、新增或编辑科目，请先在账套管理中停用该账套，或新建未启用账套完成初始化。';
  const existingAccountCodes = useMemo(() => new Set(flattenAccountCodes(accounts)), [accounts]);
  const filteredStandardAccountTemplates = useMemo(
    () =>
      standardAccountTemplates.filter((account) => {
        const keyword = standardAccountKeyword.trim();
        const matchesKeyword = !keyword || account.code.includes(keyword) || account.name.includes(keyword);
        const matchesType = standardAccountTypeFilter === 'all' || account.accountType === standardAccountTypeFilter;
        return matchesKeyword && matchesType;
      }),
    [standardAccountKeyword, standardAccountTypeFilter],
  );

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const [data, accountSetData] = await Promise.all([api.get('/accounts/tree'), api.get('/account-sets')]);
      setAccounts(data || []);
      setCurrentAccountSetStatus(
        (accountSetData || []).find((accountSet: AccountSetRecord) => accountSet.id === currentAccountSetId)?.status,
      );
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const closeModal = () => {
    setOpen(false);
    setEditingAccount(null);
    form.resetFields();
  };

  const openCreate = () => {
    setEditingAccount(null);
    form.resetFields();
    setOpen(true);
  };

  const openEdit = (record: AccountRecord) => {
    setEditingAccount(record);
    form.setFieldsValue({
      ...record,
      requiredAuxiliaries: record.requiredAuxiliaries?.join(',') ?? '',
      isLeaf: record.isLeaf ?? true,
      isCash: record.isCash ?? false,
      isBank: record.isBank ?? false,
      isEnabled: record.isEnabled ?? true,
      allowManualEntry: record.allowManualEntry ?? true,
    });
    setOpen(true);
  };

  const handleSave = async (values: AccountFormValues) => {
    const payload = {
      ...values,
      isLeaf: values.isLeaf ?? true,
      isCash: values.isCash ?? false,
      isBank: values.isBank ?? false,
      isEnabled: values.isEnabled ?? true,
      allowManualEntry: values.allowManualEntry ?? true,
      requiredAuxiliaries: parseAuxiliaries(values.requiredAuxiliaries),
    };

    try {
      if (editingAccount) {
        await api.patch(`/accounts/${editingAccount.code}`, {
          ...payload,
          code: undefined,
          updatedBy: currentUser,
        });
        message.success('科目已更新');
      } else {
        await api.post('/accounts', {
          ...payload,
          accountSetId: currentAccountSetId,
          createdBy: currentUser,
        });
        message.success('科目已创建');
      }
      closeModal();
      fetchAccounts();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleImportStandard = async () => {
    if (!currentAccountSetId) {
      message.error('请先选择账套');
      return;
    }
    setSelectedStandardAccountCodes(standardAccountTemplates.filter((account) => !existingAccountCodes.has(account.code)).map((account) => account.code));
    setStandardImportOpen(true);
  };

  const handleConfirmStandardImport = async () => {
    if (!currentAccountSetId) {
      message.error('请先选择账套');
      return;
    }
    const rows = standardAccountTemplates
      .filter((account) => selectedStandardAccountCodes.includes(account.code) && !existingAccountCodes.has(account.code))
      .map(toImportAccountRow);
    if (rows.length === 0) {
      message.error('请至少选择一个未导入的标准科目');
      return;
    }
    try {
      await api.post('/accounts/import', {
        accountSetId: currentAccountSetId,
        importedBy: currentUser,
        rows,
      });
      message.success(`已导入 ${rows.length} 个标准科目`);
      setStandardImportOpen(false);
      fetchAccounts();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const openImportPreview = () => {
    setImportPreviewRows(parseImportRows(importText));
    setImportOpen(true);
  };

  const handlePreviewImportRows = () => {
    const rows = parseImportRows(importText);
    setImportPreviewRows(rows);
    if (rows.length === 0) {
      message.error('没有可导入的科目行');
    }
  };

  const handleConfirmImport = async () => {
    if (!currentAccountSetId) {
      message.error('请先选择账套');
      return;
    }
    const rows = importPreviewRows.length > 0 ? importPreviewRows : parseImportRows(importText);
    if (rows.length === 0) {
      message.error('没有可导入的科目行');
      return;
    }

    try {
      await api.post('/accounts/import', {
        accountSetId: currentAccountSetId,
        importedBy: currentUser,
        rows,
      });
      message.success(`已导入 ${rows.length} 个科目`);
      setImportOpen(false);
      fetchAccounts();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleDisable = async (record: AccountRecord) => {
    try {
      await api.post(`/accounts/${record.code}/disable`, { disabledBy: currentUser });
      message.success('科目已停用');
      fetchAccounts();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleEnable = async (record: AccountRecord) => {
    try {
      await api.post(`/accounts/${record.code}/enable`, { enabledBy: currentUser });
      message.success('科目已启用');
      fetchAccounts();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleDelete = async (record: AccountRecord) => {
    try {
      await api.delete(`/accounts/${record.code}`, { deletedBy: currentUser });
      message.success('科目已删除');
      fetchAccounts();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>会计科目</h2>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={fetchAccounts}>
            刷新
          </Button>
          <Button icon={<ImportOutlined />} onClick={handleImportStandard} disabled={isAccountSetLocked} title={masterDataLockMessage}>
            导入标准科目
          </Button>
          <Button
            data-testid="account-import-preview"
            icon={<ImportOutlined />}
            onClick={openImportPreview}
            disabled={isAccountSetLocked}
            title={masterDataLockMessage}
          >
            导入预览
          </Button>
          <Button
            data-testid="account-create"
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            disabled={isAccountSetLocked}
            title={masterDataLockMessage}
          >
            新增科目
          </Button>
        </Space>
      </div>

      {isAccountSetLocked ? <Alert type="warning" showIcon title={masterDataLockMessage} /> : null}

      <Table
        dataSource={accounts}
        rowKey="code"
        loading={loading}
        columns={[
          { title: '编码', dataIndex: 'code' },
          { title: '名称', dataIndex: 'name' },
          { title: '类型', dataIndex: 'accountType', render: (value: string) => accountTypeText[value] ?? value },
          { title: '余额方向', dataIndex: 'normalBalance', render: (value: string) => normalBalanceText[value] ?? value },
          { title: '末级', dataIndex: 'isLeaf', render: (value: boolean) => zhBool(value) },
          { title: '允许手工录入', dataIndex: 'allowManualEntry', render: (value: boolean) => zhBool(value) },
          {
            title: '标记',
            key: 'flags',
            render: (_: unknown, record: AccountRecord) => (
              <Space size={4} wrap>
                {record.isCash ? <Tag>现金</Tag> : null}
                {record.isBank ? <Tag>银行</Tag> : null}
              </Space>
            ),
          },
          {
            title: '状态',
            dataIndex: 'isEnabled',
            render: (value: boolean) => <Tag color={value ? 'green' : 'red'}>{value ? '已启用' : '已停用'}</Tag>,
          },
          {
            title: '辅助核算',
            dataIndex: 'requiredAuxiliaries',
            render: (values: string[]) => values?.join(', ') || '-',
          },
          {
            title: '操作',
            key: 'actions',
            render: (_: unknown, record: AccountRecord) => (
              <Space size={8}>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} disabled={isAccountSetLocked} title={masterDataLockMessage}>
                  编辑
                </Button>
                {record.isEnabled ? (
                  <Button
                    size="small"
                    danger
                    icon={<StopOutlined />}
                    onClick={() => handleDisable(record)}
                    disabled={isAccountSetLocked}
                    title={masterDataLockMessage}
                  >
                    停用
                  </Button>
                ) : (
                  <Button
                    size="small"
                    icon={<CheckCircleOutlined />}
                    onClick={() => handleEnable(record)}
                    disabled={isAccountSetLocked}
                    title={masterDataLockMessage}
                  >
                    启用
                  </Button>
                )}
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => handleDelete(record)}
                  disabled={isAccountSetLocked}
                  title={masterDataLockMessage}
                >
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editingAccount ? '编辑科目' : '新增科目'}
        open={open}
        onCancel={closeModal}
        onOk={() => form.submit()}
        okText={editingAccount ? '保存' : '创建'}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{
            accountType: 'asset',
            normalBalance: 'debit',
            isLeaf: true,
            isCash: false,
            isBank: false,
            isEnabled: true,
            allowManualEntry: true,
          }}
        >
          <Form.Item name="code" label="科目编码" rules={[{ required: true, message: '请输入科目编码' }]}>
            <Input disabled={Boolean(editingAccount)} />
          </Form.Item>
          <Form.Item name="name" label="科目名称" rules={[{ required: true, message: '请输入科目名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="accountType" label="科目类型" rules={[{ required: true }]}>
            <Select options={accountTypeOptions} />
          </Form.Item>
          <Form.Item name="normalBalance" label="余额方向" rules={[{ required: true }]}>
            <Select options={normalBalanceOptions} />
          </Form.Item>
          <Form.Item name="requiredAuxiliaries" label="必填辅助核算">
            <Input placeholder="department,customer" />
          </Form.Item>
          <Space size={24} wrap>
            <Form.Item name="isLeaf" label="末级科目" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="allowManualEntry" label="允许手工录入" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="isCash" label="现金科目" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="isBank" label="银行科目" valuePropName="checked">
              <Switch />
            </Form.Item>
            {editingAccount ? (
              <Form.Item name="isEnabled" label="启用" valuePropName="checked">
                <Switch />
              </Form.Item>
            ) : null}
          </Space>
        </Form>
      </Modal>

      <Modal
        title="导入科目预览"
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        footer={[
          <Button key="preview" onClick={handlePreviewImportRows}>
            预览
          </Button>,
          <Button key="cancel" onClick={() => setImportOpen(false)}>
            取消
          </Button>,
          <Button
            key="import"
            data-testid="account-import-confirm"
            type="primary"
            disabled={importPreviewRows.length === 0 || isAccountSetLocked}
            onClick={handleConfirmImport}
          >
            导入
          </Button>,
        ]}
        width={900}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <Input.TextArea
            rows={6}
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder="code,name,accountType,normalBalance,isLeaf,isCash,isBank,allowManualEntry"
          />
          <Table
            dataSource={importPreviewRows}
            rowKey="code"
            pagination={false}
            size="small"
            columns={[
              { title: '编码', dataIndex: 'code' },
              { title: '名称', dataIndex: 'name' },
              { title: '类型', dataIndex: 'accountType', render: (value: string) => accountTypeText[value] ?? value },
              { title: '余额方向', dataIndex: 'normalBalance', render: (value: string) => normalBalanceText[value] ?? value },
              { title: '末级', dataIndex: 'isLeaf', render: (value: boolean) => zhBool(value) },
              { title: '现金', dataIndex: 'isCash', render: (value: boolean) => zhBool(value) },
              { title: '银行', dataIndex: 'isBank', render: (value: boolean) => zhBool(value) },
            ]}
          />
        </div>
      </Modal>

      <Modal
        title="小企业会计准则常用科目"
        open={standardImportOpen}
        onCancel={() => setStandardImportOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setStandardImportOpen(false)}>
            取消
          </Button>,
          <Button
            key="import"
            data-testid="standard-account-import-confirm"
            type="primary"
            disabled={selectedStandardAccountCodes.filter((code) => !existingAccountCodes.has(code)).length === 0 || isAccountSetLocked}
            onClick={handleConfirmStandardImport}
          >
            确认导入 {selectedStandardAccountCodes.filter((code) => !existingAccountCodes.has(code)).length} 个科目
          </Button>,
        ]}
        width={1100}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <Alert
            type="info"
            showIcon
            title="默认勾选当前账套尚未存在的标准科目；已存在的科目会保留在列表中用于核对，但不会重复导入。"
          />
          <Space wrap>
            <Input
              allowClear
              placeholder="搜索编码或名称"
              value={standardAccountKeyword}
              onChange={(event) => setStandardAccountKeyword(event.target.value)}
              style={{ width: 220 }}
            />
            <Select
              value={standardAccountTypeFilter}
              onChange={setStandardAccountTypeFilter}
              style={{ width: 160 }}
              options={[{ value: 'all', label: '全部类型' }, ...accountTypeOptions]}
            />
            <Button
              onClick={() =>
                setSelectedStandardAccountCodes(
                  filteredStandardAccountTemplates.filter((account) => !existingAccountCodes.has(account.code)).map((account) => account.code),
                )
              }
            >
              勾选当前筛选
            </Button>
            <Button onClick={() => setSelectedStandardAccountCodes([])}>清空勾选</Button>
          </Space>
          <Table
            dataSource={filteredStandardAccountTemplates}
            rowKey="code"
            size="small"
            pagination={{ pageSize: 12, showSizeChanger: false }}
            rowSelection={{
              selectedRowKeys: selectedStandardAccountCodes,
              onChange: (keys) => setSelectedStandardAccountCodes(keys.map(String)),
              getCheckboxProps: (record) => ({
                disabled: existingAccountCodes.has(record.code),
              }),
            }}
            columns={[
              { title: '编码', dataIndex: 'code', width: 90 },
              { title: '名称', dataIndex: 'name' },
              { title: '类别', dataIndex: 'category', width: 120 },
              { title: '类型', dataIndex: 'accountType', width: 100, render: (value: string) => accountTypeText[value] ?? value },
              { title: '余额方向', dataIndex: 'normalBalance', width: 100, render: (value: string) => normalBalanceText[value] ?? value },
              {
                title: '标记',
                key: 'flags',
                width: 120,
                render: (_: unknown, record) => (
                  <Space size={4} wrap>
                    {record.isCash ? <Tag>现金</Tag> : null}
                    {record.isBank ? <Tag>银行</Tag> : null}
                  </Space>
                ),
              },
              {
                title: '状态',
                key: 'importStatus',
                width: 100,
                render: (_: unknown, record) =>
                  existingAccountCodes.has(record.code) ? <Tag color="green">已存在</Tag> : <Tag color="blue">可导入</Tag>,
              },
            ]}
          />
        </div>
      </Modal>
    </div>
  );
};
