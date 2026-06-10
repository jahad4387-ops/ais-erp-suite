import React, { useEffect, useState } from 'react';
import { Alert, Button, Col, Form, InputNumber, Row, Select, Space, Table, message } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

export const OpeningBalances: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [trialBalance, setTrialBalance] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const { currentPeriod, currentUser, currentYear } = useAppContext();

  const fetchOpeningBalances = async () => {
    setLoading(true);
    try {
      const [accountData, balanceData, trialData] = await Promise.all([
        api.get('/accounts'),
        api.get('/opening-balances'),
        api.get('/opening-balances/trial-balance'),
      ]);
      setAccounts(accountData || []);
      setBalances(balanceData || []);
      setTrialBalance(trialData);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpeningBalances();
  }, []);

  const handleSave = async (values: any) => {
    try {
      await api.post('/opening-balances', {
        accountCode: values.accountCode,
        fiscalYear: values.fiscalYear,
        periodNo: values.periodNo,
        openingDebit: Number(values.openingDebit) || 0,
        openingCredit: Number(values.openingCredit) || 0,
        enteredBy: currentUser,
      });
      message.success('期初余额已保存');
      form.resetFields();
      fetchOpeningBalances();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <h2 style={{ margin: 0 }}>期初余额</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchOpeningBalances}>
          刷新
        </Button>
      </div>

      <Alert
        type={trialBalance?.totals?.isBalanced ? 'success' : 'error'}
        showIcon
        title={`期初借方 ${trialBalance?.totals?.openingDebit ?? 0} / 期初贷方 ${trialBalance?.totals?.openingCredit ?? 0} / 差额 ${trialBalance?.totals?.difference ?? 0}`}
      />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        initialValues={{ fiscalYear: currentYear, periodNo: currentPeriod, openingDebit: 0, openingCredit: 0 }}
      >
        <Row gutter={16}>
          <Col xs={24} md={7}>
            <Form.Item name="accountCode" label="科目" rules={[{ required: true, message: '请选择科目' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                options={accounts.map((account) => ({ value: account.code, label: `${account.code} ${account.name}` }))}
              />
            </Form.Item>
          </Col>
          <Col xs={12} md={3}>
            <Form.Item name="fiscalYear" label="年度" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={2000} max={2100} />
            </Form.Item>
          </Col>
          <Col xs={12} md={3}>
            <Form.Item name="periodNo" label="期间" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={1} max={12} />
            </Form.Item>
          </Col>
          <Col xs={12} md={4}>
            <Form.Item name="openingDebit" label="期初借方">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item>
          </Col>
          <Col xs={12} md={4}>
            <Form.Item name="openingCredit" label="期初贷方">
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item>
          </Col>
          <Col xs={24} md={3} style={{ display: 'flex', alignItems: 'center' }}>
            <Button data-testid="opening-balance-save" type="primary" htmlType="submit" icon={<PlusOutlined />} block>
              保存
            </Button>
          </Col>
        </Row>
      </Form>

      <Table
        loading={loading}
        rowKey="id"
        dataSource={balances}
        columns={[
          { title: '科目编码', dataIndex: 'accountCode' },
          { title: '科目名称', dataIndex: 'accountName' },
          { title: '年度', dataIndex: 'fiscalYear' },
          { title: '期间', dataIndex: 'periodNo' },
          { title: '期初借方', dataIndex: 'openingDebit' },
          { title: '期初贷方', dataIndex: 'openingCredit' },
        ]}
      />
    </Space>
  );
};
