import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tabs, Tag, message } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';
import { zhPermission, zhRole, zhStatus } from '../i18n';

export const UserAccess: React.FC = () => {
  const [permissions, setPermissions] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [accountSets, setAccountSets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<any | null>(null);
  const [userOpen, setUserOpen] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [roleForm] = Form.useForm();
  const [userForm] = Form.useForm();
  const [grantForm] = Form.useForm();
  const { currentUser } = useAppContext();

  const fetchAccessData = async () => {
    setLoading(true);
    try {
      const [permissionData, roleData, userData, accountSetData] = await Promise.all([
        api.get('/permissions'),
        api.get('/roles'),
        api.get('/users'),
        api.get('/account-sets'),
      ]);
      setPermissions(permissionData || []);
      setRoles(roleData || []);
      setUsers(userData || []);
      setAccountSets(accountSetData || []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccessData();
  }, []);

  const openRoleCreate = () => {
    setEditingRole(null);
    roleForm.resetFields();
    setRoleOpen(true);
  };

  const handleEditRole = (role: any) => {
    setEditingRole(role);
    roleForm.setFieldsValue({
      name: role.name,
      description: role.description,
      permissionCodes: role.permissionCodes,
    });
    setRoleOpen(true);
  };

  const closeRoleModal = () => {
    setRoleOpen(false);
    setEditingRole(null);
    roleForm.resetFields();
  };

  const handleSaveRole = async (values: any) => {
    try {
      const payload = {
        ...values,
        [editingRole ? 'updatedBy' : 'createdBy']: currentUser,
      };
      if (editingRole) {
        await api.patch(`/roles/${editingRole.id}`, payload);
        message.success('角色已更新');
      } else {
        await api.post('/roles', payload);
        message.success('角色已创建');
      }
      closeRoleModal();
      fetchAccessData();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleCreateUser = async (values: any) => {
    try {
      await api.post('/users', {
        ...values,
        createdBy: currentUser,
      });
      message.success('用户已创建');
      userForm.resetFields();
      setUserOpen(false);
      fetchAccessData();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleDeleteUser = async (record: any) => {
    try {
      await api.delete(`/users/${record.id}`, { deletedBy: currentUser });
      message.success('用户已删除');
      fetchAccessData();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  const handleGrantAccountSet = async (values: any) => {
    try {
      await api.post(`/account-sets/${values.accountSetId}/users`, {
        actorId: values.actorId,
        grantedBy: currentUser,
      });
      message.success('账套授权已保存');
      grantForm.resetFields();
      setGrantOpen(false);
      fetchAccessData();
    } catch (error: any) {
      message.error(error.message);
    }
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <h2 style={{ margin: 0 }}>用户与角色权限</h2>
        <Button icon={<ReloadOutlined />} onClick={fetchAccessData}>
          刷新
        </Button>
      </div>

      <Tabs
        items={[
          {
            key: 'roles',
            label: '角色权限',
            children: (
              <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                <Button data-testid="role-create" type="primary" icon={<PlusOutlined />} onClick={openRoleCreate}>
                  新增角色
                </Button>
                <Table
                  loading={loading}
                  dataSource={roles}
                  rowKey="id"
                  columns={[
                    { title: '角色名称', dataIndex: 'name', render: (value: string) => zhRole(value) },
                    { title: '说明', dataIndex: 'description' },
                    {
                      title: '权限',
                      dataIndex: 'permissionCodes',
                      render: (values: string[]) => (
                        <Space wrap>
                          {values?.map((value) => (
                            <Tag key={value} title={value}>{zhPermission(value)}</Tag>
                          ))}
                        </Space>
                      ),
                    },
                    {
                      title: '操作',
                      render: (_, record) => (
                        <Button data-testid="role-edit" size="small" icon={<EditOutlined />} onClick={() => handleEditRole(record)}>
                          编辑
                        </Button>
                      ),
                    },
                  ]}
                />
              </Space>
            ),
          },
          {
            key: 'users',
            label: '用户',
            children: (
              <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                <Button data-testid="user-create" type="primary" icon={<PlusOutlined />} onClick={() => setUserOpen(true)}>
                  新增用户
                </Button>
                <Table
                  loading={loading}
                  dataSource={users}
                  rowKey="id"
                  columns={[
                    { title: '用户名', dataIndex: 'username' },
                    { title: '姓名', dataIndex: 'name' },
                    { title: '角色', dataIndex: 'role', render: (value: string) => zhRole(value) },
                    { title: '角色 ID', dataIndex: 'roleId' },
                    {
                      title: '操作',
                      render: (_, record) => {
                        const disabled = record.id === 'system' || record.id === currentUser || record.username === 'system';
                        return (
                          <Popconfirm
                            title="确认删除该用户？"
                            description="删除后该用户将无法登录，相关账套授权也会移除。"
                            okText="删除"
                            cancelText="取消"
                            disabled={disabled}
                            onConfirm={() => handleDeleteUser(record)}
                          >
                            <Button data-testid="user-delete" danger size="small" icon={<DeleteOutlined />} disabled={disabled}>
                              删除
                            </Button>
                          </Popconfirm>
                        );
                      },
                    },
                  ]}
                />
              </Space>
            ),
          },
          {
            key: 'account-set-grants',
            label: '账套授权',
            children: (
              <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                <Button
                  data-testid="account-set-grant-create"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setGrantOpen(true)}
                >
                  新增授权
                </Button>
                <Table
                  loading={loading}
                  dataSource={accountSets}
                  rowKey="id"
                  columns={[
                    { title: '账套编码', dataIndex: 'code' },
                    { title: '账套名称', dataIndex: 'name' },
                    { title: '公司', dataIndex: 'companyName' },
                    { title: '状态', dataIndex: 'status', render: (value: string) => zhStatus(value) },
                  ]}
                />
              </Space>
            ),
          },
        ]}
      />

      <Modal title={editingRole ? '编辑角色' : '新增角色'} open={roleOpen} onCancel={closeRoleModal} onOk={() => roleForm.submit()}>
        <Form form={roleForm} layout="vertical" onFinish={handleSaveRole}>
          <Form.Item name="name" label="角色名称" rules={[{ required: true, message: '请输入角色名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input />
          </Form.Item>
          <Form.Item name="permissionCodes" label="权限" rules={[{ required: true, message: '请选择权限' }]}>
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              options={permissions.map((permission) => ({ value: permission.code, label: zhPermission(permission.code) }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="新增用户" open={userOpen} onCancel={() => setUserOpen(false)} onOk={() => userForm.submit()}>
        <Form form={userForm} layout="vertical" onFinish={handleCreateUser}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="姓名">
            <Input />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, message: '请输入初始密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="roleId" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={roles.map((role) => ({ value: role.id, label: zhRole(role.name) }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="新增账套授权" open={grantOpen} onCancel={() => setGrantOpen(false)} onOk={() => grantForm.submit()}>
        <Form form={grantForm} layout="vertical" onFinish={handleGrantAccountSet}>
          <Form.Item name="accountSetId" label="账套" rules={[{ required: true, message: '请选择账套' }]}>
            <Select options={accountSets.map((accountSet) => ({ value: accountSet.id, label: `${accountSet.code} ${accountSet.name}` }))} />
          </Form.Item>
          <Form.Item name="actorId" label="用户" rules={[{ required: true, message: '请选择用户' }]}>
            <Select options={users.map((user) => ({ value: user.id, label: `${user.username} ${user.name}` }))} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};
