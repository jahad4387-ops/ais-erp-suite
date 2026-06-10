import React from 'react';
import { Alert, Button, Col, Row, Space, Statistic, Table, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';

const { Title, Text } = Typography;

export const Dashboard: React.FC = () => {
  const { currentAccountSetName, currentYear, currentPeriod } = useAppContext();
  const tasks = [
    { key: 'draft', name: '草稿凭证', count: 1, owner: '制单人' },
    { key: 'submitted', name: '待审核凭证', count: 1, owner: '审核人' },
    { key: 'approved', name: '待记账凭证', count: 1, owner: '记账人' },
  ];

  return (
    <Space orientation="vertical" size={20} style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>
          财务工作台
        </Title>
        <Text type="secondary">
          {currentAccountSetName} · {currentYear} 年第 {currentPeriod} 期
        </Text>
      </div>
      <Alert
        type="info"
        showIcon
        title="一期闭环"
        description="按创建账套、期间、科目、凭证、审核、记账、账簿查询的顺序完成演示。"
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Statistic title="待提交凭证" value={1} />
        </Col>
        <Col xs={24} md={8}>
          <Statistic title="本期借方发生额" value={500} precision={2} />
        </Col>
        <Col xs={24} md={8}>
          <Statistic title="试算差额" value={0} precision={2} styles={{ content: { color: '#389e0d' } }} />
        </Col>
      </Row>
      <Space>
        <Button type="primary">
          <Link to="/vouchers/new">录入凭证</Link>
        </Button>
        <Button>
          <Link to="/reports/trial-balance">查看试算平衡</Link>
        </Button>
      </Space>
      <Table
        size="small"
        pagination={false}
        dataSource={tasks}
        columns={[
          { title: '工作项', dataIndex: 'name' },
          { title: '数量', dataIndex: 'count' },
          { title: '责任角色', dataIndex: 'owner' },
        ]}
      />
    </Space>
  );
};
