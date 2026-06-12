import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Row, Space, Statistic, Table, Tag, Typography } from 'antd';
import { ReloadOutlined, RobotOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type DashboardCard = {
  key: string;
  label: string;
  count: number;
  severity: 'normal' | 'warning';
  drilldown: { sourceType?: string; path: string };
};

type QueueRow = {
  id?: string;
  orderNo?: string;
  workOrderNo?: string;
  itemCode?: string;
  itemName?: string;
  warehouseCode?: string;
  status?: string;
  quantity?: number;
  lockedQuantity?: number;
  expectedDeliveryDate?: string;
  riskLevel?: string;
  toolName?: string;
};

type AgentSuggestion = {
  code: string;
  title: string;
  message: string;
  riskLevel: string;
  suggestedTool: string;
  evidenceRefs: string[];
};

type SupplyChainDashboardPayload = {
  accountSetId: string;
  fiscalYear: number;
  periodNo: number;
  asOfDate: string;
  summary: Record<string, DashboardCard>;
  queues: {
    pendingOrders: QueueRow[];
    purchaseOverdue: QueueRow[];
    inventoryExceptions: QueueRow[];
    pendingMaterialRequisitions: QueueRow[];
    pendingAgentApprovals: QueueRow[];
  };
  workOrderProgress: {
    total: number;
    released: number;
    inProgress: number;
    closed: number;
  };
  agentSuggestions: AgentSuggestion[];
};

const { Text, Title } = Typography;

const statusText: Record<string, string> = {
  draft: '草稿',
  submitted: '已提交',
  approved: '已审核',
  released: '已下达',
  in_progress: '生产中',
  closed: '已关闭',
  completed: '已完工',
  submitted_for_approval: '待审批',
};

const riskColor: Record<string, string> = {
  low: 'blue',
  medium: 'orange',
  high: 'red',
};

const formatQuantity = (value?: number) =>
  Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export const SupplyChainDashboard: React.FC = () => {
  const { currentAccountSetId, currentAccountSetName, currentPeriod, currentYear } = useAppContext();
  const [dashboard, setDashboard] = useState<SupplyChainDashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!currentAccountSetId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = await api.get(`/supply-chain/dashboard?accountSetId=${encodeURIComponent(currentAccountSetId)}&fiscalYear=${currentYear}&periodNo=${currentPeriod}`);
      setDashboard(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '供应链工作台加载失败');
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId, currentPeriod, currentYear]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const summary = dashboard?.summary;
  const agentSuggestions = dashboard?.agentSuggestions ?? [];
  const summaryCards = useMemo(
    () =>
      summary
        ? [
            summary.pendingOrders,
            summary.materialShortages,
            summary.inventoryExceptions,
            summary.purchaseOverdue,
            summary.workOrdersToIssue,
            summary.workOrdersToReceive,
            summary.costPending,
            summary.pendingAgentApprovals,
          ].filter(Boolean)
        : [],
    [summary]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            生产工作台
          </Title>
          <Text type="secondary">
            {currentAccountSetName} · {currentYear} 年第 {currentPeriod} 期
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={fetchDashboard} loading={loading}>
          刷新
        </Button>
      </div>

      {error ? <Alert type="error" showIcon title={error} /> : null}

      {agentSuggestions.length ? (
        <Alert
          type="warning"
          showIcon
          icon={<RobotOutlined />}
          title="Agent 建议"
          description={agentSuggestions.map((suggestion) => suggestion.message).join(' / ')}
        />
      ) : null}

      <Row gutter={[12, 12]}>
        {summaryCards.map((card) => (
          <Col xs={24} sm={12} lg={6} key={card.key}>
            <Card size="small" styles={{ body: { padding: 12 } }}>
              <Statistic
                title={
                  <Space size={6}>
                    <span>{card.label}</span>
                    {card.severity === 'warning' ? <Tag color="orange">预警</Tag> : null}
                  </Space>
                }
                value={card.count}
                styles={{ content: { color: card.severity === 'warning' ? '#d46b08' : undefined } }}
              />
              <Link to={card.drilldown.path}>查看明细</Link>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Table
            rowKey={(record) => record.id ?? `${record.itemCode}:${record.warehouseCode}`}
            size="small"
            loading={loading}
            pagination={false}
            dataSource={dashboard?.queues.inventoryExceptions ?? []}
            title={() => '缺料预警 / 库存异常'}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无库存异常" /> }}
            columns={[
              { title: '物料编码', dataIndex: 'itemCode' },
              { title: '物料名称', dataIndex: 'itemName' },
              { title: '仓库', dataIndex: 'warehouseCode' },
              { title: '可用数量', dataIndex: 'quantity', align: 'right', render: formatQuantity },
              { title: '锁定数量', dataIndex: 'lockedQuantity', align: 'right', render: formatQuantity },
            ]}
          />
        </Col>
        <Col xs={24} xl={12}>
          <Table
            rowKey={(record) => record.id ?? record.orderNo ?? record.workOrderNo ?? record.toolName ?? 'queue-row'}
            size="small"
            loading={loading}
            pagination={false}
            dataSource={dashboard?.queues.pendingOrders ?? []}
            title={() => '待处理订单'}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待处理订单" /> }}
            columns={[
              { title: '单号', render: (_, record) => record.orderNo ?? record.workOrderNo ?? '-' },
              {
                title: '状态',
                dataIndex: 'status',
                render: (value?: string) => <Tag>{statusText[value ?? ''] ?? value ?? '-'}</Tag>,
              },
              { title: '预计日期', dataIndex: 'expectedDeliveryDate' },
            ]}
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card size="small" title="工单进度">
            <Row gutter={[12, 12]}>
              <Col span={6}>
                <Statistic title="全部工单" value={dashboard?.workOrderProgress.total ?? 0} />
              </Col>
              <Col span={6}>
                <Statistic title="待领料" value={dashboard?.workOrderProgress.released ?? 0} />
              </Col>
              <Col span={6}>
                <Statistic title="生产中" value={dashboard?.workOrderProgress.inProgress ?? 0} />
              </Col>
              <Col span={6}>
                <Statistic title="已关闭" value={dashboard?.workOrderProgress.closed ?? 0} />
              </Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Table
            rowKey={(record) => record.id ?? record.toolName ?? 'agent-approval'}
            size="small"
            loading={loading}
            pagination={false}
            dataSource={dashboard?.queues.pendingAgentApprovals ?? []}
            title={() => 'Agent 审批待办'}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 Agent 审批" /> }}
            columns={[
              { title: '工具', dataIndex: 'toolName' },
              {
                title: '状态',
                dataIndex: 'status',
                render: (value?: string) => <Tag>{statusText[value ?? ''] ?? value ?? '-'}</Tag>,
              },
              {
                title: '风险',
                dataIndex: 'riskLevel',
                render: (value?: string) => <Tag color={riskColor[value ?? ''] ?? 'default'}>{value ?? '-'}</Tag>,
              },
            ]}
          />
        </Col>
      </Row>
    </div>
  );
};
