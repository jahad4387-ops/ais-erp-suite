import React, { useCallback, useEffect, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type PartnerType = 'supplier' | 'customer';

type Partner = {
  id: string;
  accountSetId: string;
  partnerType: 'supplier' | 'customer' | 'both';
  code: string;
  name: string;
  taxRate: number;
  creditLimit: number;
  paymentTerms: string;
  settlementMethod: string;
  isEnabled: boolean;
};

const settlementOptions = [
  { value: 'bank_transfer', label: '银行转账' },
  { value: 'bank_acceptance', label: '银行承兑' },
  { value: 'cash', label: '现金' },
  { value: 'offset', label: '往来抵销' },
];

const paymentTermOptions = [
  { value: 'COD', label: '现结' },
  { value: 'NET15', label: '15天账期' },
  { value: 'NET30', label: '30天账期' },
  { value: 'NET45', label: '45天账期' },
  { value: 'NET60', label: '60天账期' },
];

export const Partners: React.FC<{ partnerType: PartnerType }> = ({ partnerType }) => {
  const [form] = Form.useForm();
  const { currentAccountSetId, currentUser } = useAppContext();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const title = partnerType === 'supplier' ? '供应商档案' : '客户档案';
  const defaultPartnerType = partnerType === 'supplier' ? 'supplier' : 'customer';

  const fetchPartners = useCallback(async () => {
    if (!currentAccountSetId) {
      setPartners([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await api.get(`/partners?accountSetId=${currentAccountSetId}&partnerType=${partnerType}`);
      setPartners(rows ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId, partnerType]);

  useEffect(() => {
    void fetchPartners();
  }, [fetchPartners]);

  const openCreate = () => {
    setEditingPartner(null);
    form.setFieldsValue({
      partnerType: defaultPartnerType,
      taxRate: 0.13,
      creditLimit: 0,
      paymentTerms: partnerType === 'supplier' ? 'NET30' : 'NET15',
      settlementMethod: 'bank_transfer',
      isEnabled: true,
    });
    setModalOpen(true);
  };

  const openEdit = (partner: Partner) => {
    setEditingPartner(partner);
    form.setFieldsValue(partner);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!currentAccountSetId) {
      message.error('请先选择账套');
      return;
    }
    const values = await form.validateFields();
    try {
      if (editingPartner) {
        await api.patch(`/partners/${editingPartner.id}`, {
          ...values,
          updatedBy: currentUser,
        });
        message.success('往来单位已更新');
      } else {
        await api.post('/partners', {
          ...values,
          accountSetId: currentAccountSetId,
          createdBy: currentUser,
        });
        message.success(`${title}已创建`);
      }
      setModalOpen(false);
      await fetchPartners();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const columns = [
      { title: '编码', dataIndex: 'code', width: 120 },
      { title: '名称', dataIndex: 'name' },
      {
        title: '类型',
        dataIndex: 'partnerType',
        width: 120,
        render: (value: Partner['partnerType']) => (
          <Tag color={value === 'both' ? 'purple' : value === 'supplier' ? 'blue' : 'green'}>
            {value === 'both' ? '客户/供应商' : value === 'supplier' ? '供应商' : '客户'}
          </Tag>
        ),
      },
      {
        title: '税率',
        dataIndex: 'taxRate',
        width: 100,
        render: (value: number) => `${(Number(value) * 100).toFixed(1)}%`,
      },
      { title: '信用额度', dataIndex: 'creditLimit', width: 140 },
      { title: '付款/收款条件', dataIndex: 'paymentTerms', width: 140 },
      { title: '结算方式', dataIndex: 'settlementMethod', width: 140 },
      {
        title: '状态',
        dataIndex: 'isEnabled',
        width: 90,
        render: (value: boolean) => <Tag color={value ? 'green' : 'default'}>{value ? '启用' : '停用'}</Tag>,
      },
      {
        title: '操作',
        width: 100,
        render: (_: unknown, record: Partner) => (
          <Button size="small" onClick={() => openEdit(record)}>
            编辑
          </Button>
        ),
      },
    ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>{title}</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchPartners}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增
          </Button>
        </Space>
      </div>

      <Table rowKey="id" loading={loading} columns={columns} dataSource={partners} pagination={{ pageSize: 10 }} />

      <Modal title={editingPartner ? `编辑${title}` : `新增${title}`} open={modalOpen} onOk={handleSave} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="partnerType" label="往来单位类型" rules={[{ required: true, message: '请选择类型' }]}>
            <Select
              options={[
                { value: defaultPartnerType, label: title },
                { value: 'both', label: '同时是客户和供应商' },
              ]}
            />
          </Form.Item>
          <Form.Item name="code" label="编码" rules={[{ required: true, message: '请输入编码' }]}>
            <Input disabled={Boolean(editingPartner)} />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="taxRate" label="税率">
            <InputNumber min={0} max={1} step={0.01} precision={4} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="creditLimit" label="信用额度">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="paymentTerms" label="付款/收款条件">
            <Select options={paymentTermOptions} />
          </Form.Item>
          <Form.Item name="settlementMethod" label="结算方式">
            <Select options={settlementOptions} />
          </Form.Item>
          <Form.Item name="isEnabled" label="启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
