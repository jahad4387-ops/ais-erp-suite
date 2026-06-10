import React, { useState, useEffect } from 'react';
import { Form, Input, InputNumber, Button, DatePicker, Select, Space, message, Card, Typography, Statistic, Row, Col, Upload } from 'antd';
import { MinusCircleOutlined, PaperClipOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { useNavigate, useParams } from 'react-router-dom';

const { Text } = Typography;

type PendingAttachment = {
  filename: string;
  contentType: string;
  byteSize: number;
  contentBase64: string;
};

type AuxiliaryType = {
  code: string;
  name: string;
};

type AuxiliaryItem = {
  auxiliaryTypeCode: string;
  code: string;
  name: string;
  isEnabled?: boolean;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const value = String(reader.result ?? '');
      resolve(value.includes(',') ? value.split(',')[1] : value);
    });
    reader.addEventListener('error', () => reject(reader.error ?? new Error('文件读取失败')));
    reader.readAsDataURL(file);
  });
}

function calculateVoucherTotals(lines: any[] = []) {
  return lines.reduce(
    (totals, line) => {
      if (!line) {
        return totals;
      }
      return {
        debit: totals.debit + (Number(line.debit) || 0),
        credit: totals.credit + (Number(line.credit) || 0),
      };
    },
    { debit: 0, credit: 0 },
  );
}

export const VoucherEntry: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { voucherId } = useParams();
  const { currentAccountSetId, currentPeriod, currentYear, currentUser, currentUserName } = useAppContext();
  
  const [debitTotal, setDebitTotal] = useState(0);
  const [creditTotal, setCreditTotal] = useState(0);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [auxiliaryTypes, setAuxiliaryTypes] = useState<AuxiliaryType[]>([]);
  const [auxiliaryItems, setAuxiliaryItems] = useState<AuxiliaryItem[]>([]);
  const [editingVoucher, setEditingVoucher] = useState<any>(null);
  const [attachmentFile, setAttachmentFile] = useState<PendingAttachment | null>(null);
  const watchedLines = Form.useWatch('lines', form) ?? [];
  const entryYear = editingVoucher?.fiscalYear ?? currentYear;
  const entryPeriod = editingVoucher?.periodNo ?? currentPeriod;

  useEffect(() => {
    const fetchEntryData = async () => {
      try {
        const [accountData, typeData, itemData] = await Promise.all([
          api.get('/accounts'),
          api.get('/auxiliary-types'),
          api.get('/auxiliary-items'),
        ]);
        setAccounts(accountData.filter((a: any) => a.isLeaf));
        setAuxiliaryTypes(typeData || []);
        setAuxiliaryItems((itemData || []).filter((item: AuxiliaryItem) => item.isEnabled !== false));

        if (voucherId) {
          const voucher = await api.get(`/vouchers/${voucherId}`);
          setEditingVoucher(voucher);
          const lines = voucher.lines.map((line: any) => ({
            summary: line.summary,
            accountCode: line.accountCode,
            debit: line.debit,
            credit: line.credit,
            auxiliaries: line.auxiliaries ?? {},
          }));
          form.setFieldsValue({
            voucherDate: dayjs(voucher.voucherDate),
            lines,
          });
          const totals = calculateVoucherTotals(lines);
          setDebitTotal(totals.debit);
          setCreditTotal(totals.credit);
        }
      } catch (e: any) {
        message.error(e.message);
      }
    };
    fetchEntryData();
  }, [form, voucherId]);

  const getRequiredAuxiliaries = (accountCode?: string) =>
    accounts.find((account) => account.code === accountCode)?.requiredAuxiliaries ?? [];

  const getAuxiliaryTypeName = (auxiliaryCode: string) =>
    auxiliaryTypes.find((type) => type.code === auxiliaryCode)?.name ?? auxiliaryCode;

  const getAuxiliaryOptions = (auxiliaryCode: string) =>
    auxiliaryItems
      .filter((item) => item.auxiliaryTypeCode === auxiliaryCode)
      .map((item) => ({ value: item.code, label: `${item.code} ${item.name}` }));

  const handleValuesChange = (_: any, allValues: any) => {
    const totals = calculateVoucherTotals(allValues.lines);
    setDebitTotal(totals.debit);
    setCreditTotal(totals.credit);
  };

  const handleAttachmentSelect = async (file: File) => {
    try {
      const contentBase64 = await readFileAsBase64(file);
      setAttachmentFile({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        byteSize: file.size,
        contentBase64,
      });
      message.success('附件已读取，保存凭证时将一并上传');
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleSubmit = async (values: any) => {
    if (!currentAccountSetId) {
      message.error('请先在顶部栏选择账套或生成测试数据');
      return;
    }

    if (debitTotal !== creditTotal) {
      message.error('借贷不平，无法保存凭证！');
      return;
    }

    if (debitTotal === 0) {
      message.error('凭证金额不能为 0');
      return;
    }

    try {
      const payload = {
        accountSetId: editingVoucher?.accountSetId ?? currentAccountSetId,
        fiscalYear: entryYear,
        periodNo: entryPeriod,
        voucherDate: values.voucherDate.format('YYYY-MM-DD'),
        createdBy: currentUser,
        updatedBy: currentUser,
        expectedRevision: editingVoucher?.revision,
        lines: values.lines.map((l: any) => ({
          summary: l.summary,
          accountCode: l.accountCode,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          auxiliaries: l.auxiliaries ?? {},
        }))
      };

      const voucher = voucherId ? await api.patch(`/vouchers/${voucherId}`, payload) : await api.post('/vouchers', payload);
      if (attachmentFile) {
        const attachment = await api.post('/attachments/upload', {
          filename: attachmentFile.filename,
          contentType: attachmentFile.contentType,
          byteSize: attachmentFile.byteSize,
          contentBase64: attachmentFile.contentBase64,
          uploadedBy: currentUser,
        });
        await api.post('/attachment-links', {
          attachmentId: attachment.id,
          objectType: 'voucher',
          objectId: voucher.id,
          linkedBy: currentUser,
        });
      }
      message.success(voucherId ? '凭证已更新' : '凭证保存成功！');
      navigate('/vouchers');
    } catch (e: any) {
      message.error(`保存失败: ${e.message}`);
    }
  };

  return (
    <div style={{ paddingBottom: 60 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>{voucherId ? '编辑凭证' : '录入凭证'}</h2>
      </div>

      {!currentAccountSetId && (
        <Card style={{ marginBottom: 16, background: '#fff2f0', borderColor: '#ffccc7' }}>
          <Text type="danger">请先创建账套或在凭证列表页点击“生成测试数据”，然后系统会自动选中该账套。</Text>
        </Card>
      )}

      <Form
        form={form}
        name="voucher_entry"
        layout="vertical"
        onValuesChange={handleValuesChange}
        onFinish={handleSubmit}
        initialValues={{ lines: [{}, {}] }} // start with 2 empty lines
      >
        <Card title="基本信息" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="voucherDate" label="凭证日期" rules={[{ required: true, message: '请选择日期' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="会计期间">
                <Input disabled value={`${entryYear}年 - 第${entryPeriod}期`} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="制单人">
                <Input disabled value={currentUserName} />
              </Form.Item>
            </Col>
          </Row>
        </Card>

        <Card title="凭证分录">
          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <>
                <Row gutter={16} style={{ marginBottom: 8, fontWeight: 'bold' }}>
                  <Col span={5}>摘要</Col>
                  <Col span={5}>科目</Col>
                  <Col span={5}>辅助核算</Col>
                  <Col span={4}>借方金额</Col>
                  <Col span={4}>贷方金额</Col>
                  <Col span={1}>操作</Col>
                </Row>
                {fields.map(({ key, name, ...restField }) => {
                  const accountCode = watchedLines?.[name]?.accountCode;
                  const requiredAuxiliaries = getRequiredAuxiliaries(accountCode);

                  return (
                  <Row gutter={16} key={key} style={{ marginBottom: 8 }}>
                    <Col span={5}>
                      <Form.Item
                        {...restField}
                        name={[name, 'summary']}
                        rules={[{ required: true, message: '请输入摘要' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Input placeholder="摘要" />
                      </Form.Item>
                    </Col>
                    <Col span={5}>
                      <Form.Item
                        {...restField}
                        name={[name, 'accountCode']}
                        rules={[{ required: true, message: '请选择科目' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="选择科目"
                          options={accounts.map(a => ({ value: a.code, label: `${a.code} ${a.name}` }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={5}>
                      {requiredAuxiliaries.length > 0 ? (
                        requiredAuxiliaries.map((auxiliaryCode: string) => (
                          <Form.Item
                            key={auxiliaryCode}
                            {...restField}
                            name={[name, 'auxiliaries', auxiliaryCode]}
                            rules={[{ required: true, message: `请选择${getAuxiliaryTypeName(auxiliaryCode)}` }]}
                            style={{ marginBottom: requiredAuxiliaries.length > 1 ? 8 : 0 }}
                          >
                            <Select
                              showSearch
                              optionFilterProp="label"
                              placeholder={getAuxiliaryTypeName(auxiliaryCode)}
                              options={getAuxiliaryOptions(auxiliaryCode)}
                            />
                          </Form.Item>
                        ))
                      ) : (
                        <Text type="secondary">-</Text>
                      )}
                    </Col>
                    <Col span={4}>
                      <Form.Item
                        {...restField}
                        name={[name, 'debit']}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber min={0} style={{ width: '100%' }} precision={2} placeholder="借方金额" />
                      </Form.Item>
                    </Col>
                    <Col span={4}>
                      <Form.Item
                        {...restField}
                        name={[name, 'credit']}
                        style={{ marginBottom: 0 }}
                      >
                        <InputNumber min={0} style={{ width: '100%' }} precision={2} placeholder="贷方金额" />
                      </Form.Item>
                    </Col>
                    <Col span={1} style={{ display: 'flex', alignItems: 'center' }}>
                      <MinusCircleOutlined onClick={() => remove(name)} style={{ color: 'red', fontSize: 16 }} />
                    </Col>
                  </Row>
                  );
                })}
                <Form.Item style={{ marginTop: 16 }}>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    增加分录
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Card>

        <Card title="附件" style={{ marginTop: 16 }}>
          <Upload
            data-testid="voucher-attachment-upload"
            maxCount={1}
            beforeUpload={(file) => {
              void handleAttachmentSelect(file);
              return false;
            }}
            onRemove={() => {
              setAttachmentFile(null);
            }}
          >
            <Button icon={<PaperClipOutlined />}>选择附件</Button>
          </Upload>
          {attachmentFile && (
            <Text type="secondary">
              {attachmentFile.filename} / {attachmentFile.contentType} / {attachmentFile.byteSize} 字节
            </Text>
          )}
        </Card>

        {/* 底部固定结算栏 */}
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 200, // accommodate sider
          right: 0,
          background: '#fff',
          padding: '16px 24px',
          boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10
        }}>
          <Space size="large">
            <Statistic title="借方合计" value={debitTotal} precision={2} styles={{ content: { color: '#3f8600' } }} />
            <Statistic title="贷方合计" value={creditTotal} precision={2} styles={{ content: { color: '#3f8600' } }} />
            <Statistic 
              title="差额" 
              value={debitTotal - creditTotal} 
              precision={2} 
              styles={{ content: { color: debitTotal === creditTotal ? '#3f8600' : '#cf1322' } }}
            />
          </Space>
          <Space>
            <Button onClick={() => navigate('/vouchers')}>取消</Button>
            <Button type="primary" htmlType="submit" disabled={debitTotal !== creditTotal || debitTotal === 0}>
              保存凭证
            </Button>
          </Space>
        </div>
      </Form>
    </div>
  );
};
