import React, { useState } from 'react';
import { Alert, Button, Card, Col, Form, Input, Row, Space, Statistic, Table, Tag, Upload, message } from 'antd';
import { CheckOutlined, PaperClipOutlined, RobotOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

const { TextArea } = Input;

type PendingAttachment = {
  filename: string;
  contentType: string;
  byteSize: number;
  contentBase64: string;
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

export const AgentCenter: React.FC = () => {
  const [form] = Form.useForm();
  const [suggestion, setSuggestion] = useState<any | null>(null);
  const [phase2AgentResult, setPhase2AgentResult] = useState<any | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [uploadedAttachmentIds, setUploadedAttachmentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [phase2Loading, setPhase2Loading] = useState(false);
  const [converting, setConverting] = useState(false);
  const navigate = useNavigate();
  const { currentAccountSetId, currentPeriod, currentUser, currentYear } = useAppContext();

  const handleGenerate = async (values: { content: string; evidenceRefs?: string }) => {
    if (!currentAccountSetId) {
      message.error('请先选择或创建账套');
      return;
    }

    setLoading(true);
    try {
      let attachmentIds = uploadedAttachmentIds;
      if (pendingAttachment) {
        const attachment = await api.post('/attachments/upload', {
          accountSetId: currentAccountSetId,
          filename: pendingAttachment.filename,
          contentType: pendingAttachment.contentType,
          byteSize: pendingAttachment.byteSize,
          contentBase64: pendingAttachment.contentBase64,
          uploadedBy: currentUser,
        });
        attachmentIds = [...uploadedAttachmentIds, attachment.id];
        setUploadedAttachmentIds(attachmentIds);
        setPendingAttachment(null);
      }

      const result = await api.post('/ai/voucher-drafts', {
        accountSetId: currentAccountSetId,
        fiscalYear: currentYear,
        periodNo: currentPeriod,
        voucherDate: new Date().toISOString().slice(0, 10),
        content: values.content,
        evidenceRefs: values.evidenceRefs
          ? values.evidenceRefs.split(',').map((item) => item.trim()).filter(Boolean)
          : [],
        attachmentIds,
        requestedBy: currentUser,
        dryRun: true,
      });
      setSuggestion(result);
      message.success('已生成草稿建议');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAttachmentSelect = async (file: File) => {
    try {
      const contentBase64 = await readFileAsBase64(file);
      setPendingAttachment({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        byteSize: file.size,
        contentBase64,
      });
      message.success('附件已读取，将作为智能凭证证据上传');
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleConvert = async () => {
    if (!suggestion) return;

    setConverting(true);
    try {
      await api.post(`/ai/voucher-suggestions/${suggestion.id}/convert-to-voucher`, {
        reviewedBy: currentUser,
      });
      message.success('已转为正式凭证草稿');
      navigate('/vouchers');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setConverting(false);
    }
  };

  const runPhase2Agent = async (kind: 'reconciliation' | 'collection' | 'exception') => {
    if (!currentAccountSetId) {
      message.error('请先选择或创建账套');
      return;
    }
    setPhase2Loading(true);
    try {
      const payload = {
        accountSetId: currentAccountSetId,
        dryRun: true,
        asOfDate: new Date().toISOString().slice(0, 10),
        requestedBy: currentUser,
      };
      const result =
        kind === 'reconciliation'
          ? await api.post('/ai/reconciliation-suggestions', payload)
          : kind === 'collection'
            ? await api.post('/ai/collection-drafts', payload)
            : await api.post('/ai/exception-checks', payload);
      setPhase2AgentResult({ kind, ...result });
      message.success('已生成 dry-run 结果');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setPhase2Loading(false);
    }
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <div>
        <h2 style={{ marginBottom: 0 }}>智能助手中心</h2>
      </div>

      <Row gutter={16}>
        <Col xs={24} lg={10}>
          <Card title="智能凭证建议">
            <Form
              form={form}
              layout="vertical"
              onFinish={handleGenerate}
              initialValues={{
                content: '购买办公用品 500 元，通过银行付款',
              }}
            >
              <Form.Item name="content" label="原始业务内容" rules={[{ required: true, message: '请输入业务内容' }]}>
                <TextArea rows={5} />
              </Form.Item>
              <Form.Item name="evidenceRefs" label="附件或证据编号">
                <Input placeholder="发票-001,银行回单-001" />
              </Form.Item>
              <Upload
                data-testid="agent-ai-attachment-upload"
                beforeUpload={(file) => {
                  handleAttachmentSelect(file);
                  return false;
                }}
                maxCount={1}
              >
                <Button block icon={<PaperClipOutlined />}>
                  上传附件证据
                </Button>
              </Upload>
              {pendingAttachment ? (
                <Tag style={{ marginTop: 8 }} color="blue">
                  {pendingAttachment.filename} / {pendingAttachment.byteSize} 字节
                </Tag>
              ) : null}
              <Button block type="primary" icon={<RobotOutlined />} htmlType="submit" loading={loading}>
                生成建议
              </Button>
            </Form>
          </Card>
          <Card title="Phase 2 Agent dry-run" style={{ marginTop: 16 }}>
            <Space orientation="vertical" style={{ width: '100%' }}>
              <Button block loading={phase2Loading} onClick={() => runPhase2Agent('reconciliation')}>
                生成核销建议
              </Button>
              <Button block loading={phase2Loading} onClick={() => runPhase2Agent('collection')}>
                生成催收草稿
              </Button>
              <Button block loading={phase2Loading} onClick={() => runPhase2Agent('exception')}>
                运行异常检查
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          {suggestion ? (
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic title="置信度" value={suggestion.confidence * 100} precision={0} suffix="%" />
                </Col>
                <Col span={8}>
                  <Statistic title="风险等级" value={suggestion.riskLevel} />
                </Col>
                <Col span={8}>
                  <Statistic title="人工确认" value={suggestion.approvalRequired ? '必需' : '无需'} />
                </Col>
              </Row>
              <Alert
                type="warning"
                showIcon
                title="审核提示"
                description={
                  <Space wrap>
                    {suggestion.warnings?.map((warning: string) => (
                      <Tag color="orange" key={warning}>
                        {warning}
                      </Tag>
                    ))}
                  </Space>
                }
              />
              <Table
                size="small"
                pagination={false}
                rowKey="lineNo"
                dataSource={suggestion.draft.lines}
                columns={[
                  { title: '行号', dataIndex: 'lineNo' },
                  { title: '摘要', dataIndex: 'summary' },
                  { title: '科目', dataIndex: 'accountCode' },
                  { title: '借方', dataIndex: 'debit', render: (value: number) => (value > 0 ? value : '') },
                  { title: '贷方', dataIndex: 'credit', render: (value: number) => (value > 0 ? value : '') },
                ]}
              />
              <Button type="primary" icon={<CheckOutlined />} loading={converting} onClick={handleConvert}>
                确认转凭证
              </Button>
            </Space>
          ) : (
            <Alert type="info" showIcon title="暂无建议" />
          )}
          {phase2AgentResult ? (
            <Alert
              style={{ marginTop: 16 }}
              type="info"
              showIcon
              title="Phase 2 dry-run 结果"
              description={
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                  {JSON.stringify(phase2AgentResult.suggestions ?? phase2AgentResult.drafts ?? phase2AgentResult.findings ?? [], null, 2)}
                </pre>
              }
            />
          ) : null}
        </Col>
      </Row>
    </Space>
  );
};
