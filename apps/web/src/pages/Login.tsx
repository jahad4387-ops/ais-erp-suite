import React, { useState } from 'react';
import { Button, Card, Form, Input, Space, Typography, message } from 'antd';
import { LoginOutlined } from '@ant-design/icons';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

const { Text } = Typography;

export const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, setCurrentUser } = useAppContext();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const session = await api.login(values.username, values.password);
      setCurrentUser(session.user, session.accessToken);
      message.success('登录成功');
      navigate(from, { replace: true });
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>用户登录</h2>
          <Text type="secondary">使用一期本地账号进入财务工作台</Text>
        </div>
        <Card>
          <Form
            layout="vertical"
            initialValues={{ username: 'system', password: 'system' }}
            onFinish={handleSubmit}
          >
            <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password autoComplete="current-password" />
            </Form.Item>
            <Button block type="primary" htmlType="submit" icon={<LoginOutlined />} loading={loading}>
              登录
            </Button>
          </Form>
        </Card>
      </Space>
    </div>
  );
};
