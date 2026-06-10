import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Space, Table, Tag, message } from 'antd';
import { CheckCircleOutlined, EditOutlined, PlusOutlined, ReloadOutlined, StopOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { zhStatus } from '../i18n';

type AccountSetRecord = {
  id: string;
  code: string;
  name: string;
  companyName: string;
  baseCurrency: string;
  accountingStandard: string;
  startYear: number;
  startPeriod: number;
  status: 'draft' | 'enabled' | 'disabled';
};

type AccountSetFormValues = Omit<AccountSetRecord, 'id' | 'status' | 'startYear' | 'startPeriod'> & {
  startYear: string | number;
  startPeriod: string | number;
};

export const AccountSets: React.FC = () => {
  const [accountSets, setAccountSets] = useState<AccountSetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingAccountSet, setEditingAccountSet] = useState<AccountSetRecord | null>(null);
  const [form] = Form.useForm<AccountSetFormValues>();
  const { currentUser, setCurrentAccountSet } = useAppContext();

  const fetchAccountSets = async () => {
    setLoading(true);
    try {
      const data = await api.get('/account-sets');
      setAccountSets(data || []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccountSets();
  }, []);

  const closeModal = () => {
    setIsModalVisible(false);
    setEditingAccountSet(null);
    form.resetFields();
  };

  const openCreate = () => {
    setEditingAccountSet(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const openEdit = (record: AccountSetRecord) => {
    setEditingAccountSet(record);
    form.setFieldsValue(record);
    setIsModalVisible(true);
  };

  const handleSave = async (values: AccountSetFormValues) => {
    const payload = {
      ...values,
      startYear: Number(values.startYear),
      startPeriod: Number(values.startPeriod),
    };

    try {
      if (editingAccountSet) {
        const updated = await api.patch(`/account-sets/${editingAccountSet.id}`, {
          ...payload,
          code: undefined,
          updatedBy: currentUser,
        });
        message.success('账套已更新');
        setCurrentAccountSet(updated.id, updated.name, updated.companyName);
      } else {
        const accountSet = await api.post('/account-sets', {
          ...payload,
          createdBy: currentUser,
        });
        await api.post(`/account-sets/${accountSet.id}/periods/generate`);
        message.success('账套已创建，会计期间已生成');
        setCurrentAccountSet(accountSet.id, accountSet.name, accountSet.companyName);
      }
      closeModal();
      fetchAccountSets();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleLifecycle = async (record: AccountSetRecord, action: 'enable' | 'disable') => {
    try {
      const updated = await api.post(`/account-sets/${record.id}/${action}`, {
        [`${action}dBy`]: currentUser,
      });
      if (action === 'enable') {
        setCurrentAccountSet(updated.id, updated.name, updated.companyName);
      }
      message.success(action === 'enable' ? '账套已启用' : '账套已停用');
      fetchAccountSets();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>账套管理</h2>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={fetchAccountSets}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增账套
          </Button>
        </Space>
      </div>

      <Table
        dataSource={accountSets}
        rowKey="id"
        loading={loading}
        columns={[
          { title: '编码', dataIndex: 'code', key: 'code' },
          { title: '名称', dataIndex: 'name', key: 'name' },
          { title: '公司', dataIndex: 'companyName', key: 'companyName' },
          { title: '本位币', dataIndex: 'baseCurrency', key: 'baseCurrency' },
          { title: '会计准则', dataIndex: 'accountingStandard', key: 'accountingStandard' },
          { title: '启用期间', key: 'start', render: (_: unknown, record: AccountSetRecord) => `${record.startYear}-${record.startPeriod}` },
          {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            render: (status: AccountSetRecord['status']) => (
              <Tag color={status === 'enabled' ? 'green' : status === 'draft' ? 'default' : 'red'}>{zhStatus(status)}</Tag>
            ),
          },
          {
            title: '操作',
            key: 'actions',
            render: (_: unknown, record: AccountSetRecord) => (
              <Space size={8} wrap>
                <Button size="small" onClick={() => setCurrentAccountSet(record.id, record.name, record.companyName)}>
                  选择
                </Button>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                  编辑
                </Button>
                {record.status !== 'enabled' ? (
                  <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => handleLifecycle(record, 'enable')}>
                    启用
                  </Button>
                ) : (
                  <Button size="small" danger icon={<StopOutlined />} onClick={() => handleLifecycle(record, 'disable')}>
                    停用
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editingAccountSet ? '编辑账套' : '新增账套'}
        open={isModalVisible}
        onCancel={closeModal}
        onOk={() => form.submit()}
        okText={editingAccountSet ? '保存' : '创建'}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{
            baseCurrency: 'CNY',
            accountingStandard: '小企业会计准则',
            startYear: new Date().getFullYear(),
            startPeriod: 1,
          }}
        >
          <Form.Item name="code" label="账套编码" rules={[{ required: true, message: '请输入账套编码' }]}>
            <Input disabled={Boolean(editingAccountSet)} />
          </Form.Item>
          <Form.Item name="name" label="账套名称" rules={[{ required: true, message: '请输入账套名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="companyName" label="公司名称" rules={[{ required: true, message: '请输入公司名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="baseCurrency" label="本位币" rules={[{ required: true, message: '请输入本位币' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="accountingStandard" label="会计准则" rules={[{ required: true, message: '请输入会计准则' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="startYear" label="启用年度" rules={[{ required: true, message: '请输入启用年度' }]}>
            <Input type="number" min={1900} />
          </Form.Item>
          <Form.Item name="startPeriod" label="启用期间" rules={[{ required: true, message: '请输入启用期间' }]}>
            <Input type="number" min={1} max={12} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
