import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Switch, Table, Tabs, Tag, message } from 'antd';
import { EditOutlined, PlusOutlined, ReloadOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { auxiliaryCategoryText, zhBool } from '../i18n';

type AuxiliaryTypeRecord = {
  id: string;
  code: string;
  name: string;
  category: string;
  isEnabled: boolean;
};

type AuxiliaryItemRecord = {
  id: string;
  auxiliaryTypeId: string;
  auxiliaryTypeCode: string;
  code: string;
  name: string;
  isEnabled: boolean;
};

type AccountRecord = {
  code: string;
  name: string;
};

type RequirementRecord = {
  id: string;
  accountCode: string;
  accountName: string;
  auxiliaryTypeCode: string;
  auxiliaryTypeName: string;
  required: boolean;
};

export const Auxiliaries: React.FC = () => {
  const [types, setTypes] = useState<AuxiliaryTypeRecord[]>([]);
  const [items, setItems] = useState<AuxiliaryItemRecord[]>([]);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [requirements, setRequirements] = useState<RequirementRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [requirementOpen, setRequirementOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AuxiliaryItemRecord | null>(null);
  const [typeForm] = Form.useForm();
  const [itemForm] = Form.useForm();
  const [requirementForm] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();

  const fetchAuxiliaries = async () => {
    setLoading(true);
    try {
      const [typeData, itemData, accountData] = await Promise.all([
        api.get('/auxiliary-types'),
        api.get('/auxiliary-items'),
        api.get('/accounts'),
      ]);
      setTypes(typeData || []);
      setItems(itemData || []);
      setAccounts(accountData || []);

      const requirementLists = await Promise.all(
        (accountData || []).map(async (account: AccountRecord) => {
          const accountRequirements = await api.get(`/accounts/${account.code}/auxiliary-requirements`);
          return accountRequirements.map((requirement: RequirementRecord) => ({
            ...requirement,
            accountName: account.name,
          }));
        }),
      );
      setRequirements(requirementLists.flat());
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuxiliaries();
  }, []);

  const openCreateItem = () => {
    setEditingItem(null);
    itemForm.resetFields();
    itemForm.setFieldsValue({ isEnabled: true });
    setItemOpen(true);
  };

  const openEditItem = (item: AuxiliaryItemRecord) => {
    setEditingItem(item);
    itemForm.setFieldsValue({
      auxiliaryTypeId: item.auxiliaryTypeId,
      code: item.code,
      name: item.name,
      isEnabled: item.isEnabled,
    });
    setItemOpen(true);
  };

  const closeItemModal = () => {
    setItemOpen(false);
    setEditingItem(null);
    itemForm.resetFields();
  };

  const handleCreateType = async (values: any) => {
    if (!currentAccountSetId) {
      message.error('请先选择账套');
      return;
    }
    try {
      await api.post('/auxiliary-types', {
        ...values,
        accountSetId: currentAccountSetId,
        createdBy: currentUser,
      });
      message.success('辅助类型已创建');
      typeForm.resetFields();
      setTypeOpen(false);
      fetchAuxiliaries();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleSaveItem = async (values: any) => {
    if (!currentAccountSetId) {
      message.error('请先选择账套');
      return;
    }
    try {
      if (editingItem) {
        await api.patch(`/auxiliary-items/${editingItem.id}`, {
          name: values.name,
          isEnabled: values.isEnabled ?? true,
          updatedBy: currentUser,
        });
        message.success('辅助项目已更新');
      } else {
        await api.post('/auxiliary-items', {
          auxiliaryTypeId: values.auxiliaryTypeId,
          code: values.code,
          name: values.name,
          isEnabled: values.isEnabled ?? true,
          accountSetId: currentAccountSetId,
          createdBy: currentUser,
        });
        message.success('辅助项目已创建');
      }
      closeItemModal();
      fetchAuxiliaries();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleDisableItem = async (item: AuxiliaryItemRecord) => {
    try {
      await api.delete(`/auxiliary-items/${item.id}`, { deletedBy: currentUser });
      message.success('辅助项目已停用');
      fetchAuxiliaries();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleEnableItem = async (item: AuxiliaryItemRecord) => {
    try {
      await api.patch(`/auxiliary-items/${item.id}`, { isEnabled: true, updatedBy: currentUser });
      message.success('辅助项目已启用');
      fetchAuxiliaries();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleSaveRequirement = async (values: any) => {
    try {
      await api.post(`/accounts/${values.accountCode}/auxiliary-requirements`, {
        auxiliaryTypeId: values.auxiliaryTypeId,
        required: values.required ?? true,
        configuredBy: currentUser,
      });
      message.success('科目辅助核算要求已保存');
      requirementForm.resetFields();
      setRequirementOpen(false);
      fetchAuxiliaries();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>辅助核算</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchAuxiliaries}>
          刷新
        </Button>
      </div>

      <Tabs
        items={[
          {
            key: 'types',
            label: '辅助类型',
            children: (
              <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                <Button data-testid="auxiliary-type-create" type="primary" icon={<PlusOutlined />} onClick={() => setTypeOpen(true)}>
                  新增类型
                </Button>
                <Table
                  loading={loading}
                  rowKey="id"
                  dataSource={types}
                  columns={[
                    { title: '编码', dataIndex: 'code' },
                    { title: '名称', dataIndex: 'name' },
                    { title: '类别', dataIndex: 'category', render: (value: string) => auxiliaryCategoryText[value] ?? value },
                    {
                      title: '状态',
                      dataIndex: 'isEnabled',
                      render: (value: boolean) => <Tag color={value ? 'green' : 'red'}>{value ? '已启用' : '已停用'}</Tag>,
                    },
                  ]}
                />
              </Space>
            ),
          },
          {
            key: 'items',
            label: '辅助项目',
            children: (
              <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                <Button data-testid="auxiliary-item-create" type="primary" icon={<PlusOutlined />} onClick={openCreateItem}>
                  新增项目
                </Button>
                <Table
                  loading={loading}
                  rowKey="id"
                  dataSource={items}
                  columns={[
                    { title: '类型', dataIndex: 'auxiliaryTypeCode' },
                    { title: '编码', dataIndex: 'code' },
                    { title: '名称', dataIndex: 'name' },
                    {
                      title: '状态',
                      dataIndex: 'isEnabled',
                      render: (value: boolean) => <Tag color={value ? 'green' : 'red'}>{value ? '已启用' : '已停用'}</Tag>,
                    },
                    {
                      title: '操作',
                      key: 'actions',
                      render: (_: unknown, record: AuxiliaryItemRecord) => (
                        <Space size={8} wrap>
                          <Button data-testid="auxiliary-item-edit" size="small" icon={<EditOutlined />} onClick={() => openEditItem(record)}>
                            编辑
                          </Button>
                          {record.isEnabled ? (
                            <Button
                              data-testid="auxiliary-item-disable"
                              size="small"
                              danger
                              icon={<StopOutlined />}
                              onClick={() => handleDisableItem(record)}
                            >
                              停用
                            </Button>
                          ) : (
                            <Button size="small" icon={<CheckCircleOutlined />} onClick={() => handleEnableItem(record)}>
                              启用
                            </Button>
                          )}
                        </Space>
                      ),
                    },
                  ]}
                />
              </Space>
            ),
          },
          {
            key: 'requirements',
            label: '科目绑定',
            children: (
              <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                <Button
                  data-testid="auxiliary-requirement-create"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setRequirementOpen(true)}
                >
                  配置科目
                </Button>
                <Table
                  loading={loading}
                  rowKey="id"
                  dataSource={requirements}
                  columns={[
                    { title: '科目', dataIndex: 'accountCode', render: (_: unknown, record: RequirementRecord) => `${record.accountCode} ${record.accountName}` },
                    { title: '辅助类型', dataIndex: 'auxiliaryTypeCode' },
                    { title: '名称', dataIndex: 'auxiliaryTypeName' },
                    { title: '必填', dataIndex: 'required', render: (value: boolean) => zhBool(value) },
                  ]}
                />
              </Space>
            ),
          },
        ]}
      />

      <Modal title="新增辅助类型" open={typeOpen} onCancel={() => setTypeOpen(false)} onOk={() => typeForm.submit()}>
        <Form form={typeForm} layout="vertical" onFinish={handleCreateType}>
          <Form.Item name="code" label="编码" rules={[{ required: true, message: '请输入编码' }]}>
            <Input placeholder="department" />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="部门" />
          </Form.Item>
          <Form.Item name="category" label="类别" initialValue="department">
            <Select
              options={[
                { value: 'department', label: '部门' },
                { value: 'employee', label: '员工' },
                { value: 'customer', label: '客户' },
                { value: 'supplier', label: '供应商' },
                { value: 'project', label: '项目' },
                { value: 'custom', label: '自定义' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingItem ? '编辑辅助项目' : '新增辅助项目'}
        open={itemOpen}
        onCancel={closeItemModal}
        onOk={() => itemForm.submit()}
        okText={editingItem ? '保存' : '创建'}
      >
        <Form form={itemForm} layout="vertical" onFinish={handleSaveItem} initialValues={{ isEnabled: true }}>
          <Form.Item name="auxiliaryTypeId" label="辅助类型" rules={[{ required: true, message: '请选择辅助类型' }]}>
            <Select
              disabled={Boolean(editingItem)}
              options={types.map((type) => ({ value: type.id, label: `${type.code} ${type.name}` }))}
            />
          </Form.Item>
          <Form.Item name="code" label="编码" rules={[{ required: true, message: '请输入编码' }]}>
            <Input disabled={Boolean(editingItem)} />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="isEnabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="配置科目辅助核算要求"
        open={requirementOpen}
        onCancel={() => setRequirementOpen(false)}
        onOk={() => requirementForm.submit()}
      >
        <Form form={requirementForm} layout="vertical" onFinish={handleSaveRequirement} initialValues={{ required: true }}>
          <Form.Item name="accountCode" label="科目" rules={[{ required: true, message: '请选择科目' }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={accounts.map((account) => ({ value: account.code, label: `${account.code} ${account.name}` }))}
            />
          </Form.Item>
          <Form.Item name="auxiliaryTypeId" label="辅助类型" rules={[{ required: true, message: '请选择辅助类型' }]}>
            <Select options={types.map((type) => ({ value: type.id, label: `${type.code} ${type.name}` }))} />
          </Form.Item>
          <Form.Item name="required" label="凭证分录必填" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};
