import React, { useMemo, useState } from 'react';
import { Alert, Button, Form, Input, Space, Tag, Typography, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type AccountCodeRule = {
  id: string;
  segments: number[];
  allowedLengths: number[];
};

type RuleFormValues = {
  pattern: string;
};

const { Text } = Typography;

export function parseSegments(pattern: string): number[] {
  const segments = pattern
    .split(/[-,\s]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => Number(segment));

  if (segments.length === 0 || segments.some((segment) => !Number.isInteger(segment) || segment <= 0)) {
    throw new Error('请输入正整数编码段，例如 4-2-2-2。');
  }

  return segments;
}

const getAllowedLengths = (segments: number[]) =>
  segments.reduce<number[]>((lengths, segment, index) => {
    const previous = index === 0 ? 0 : lengths[index - 1];
    return [...lengths, previous + segment];
  }, []);

export const AccountCodeRules: React.FC = () => {
  const [form] = Form.useForm<RuleFormValues>();
  const [saving, setSaving] = useState(false);
  const [savedRule, setSavedRule] = useState<AccountCodeRule | null>(null);
  const { currentUser } = useAppContext();
  const pattern = Form.useWatch('pattern', form) ?? '4-2-2-2';

  const preview = useMemo(() => {
    try {
      const segments = parseSegments(pattern);
      return {
        segments,
        allowedLengths: getAllowedLengths(segments),
        error: null,
      };
    } catch (error: any) {
      return {
        segments: [],
        allowedLengths: [],
        error: error.message,
      };
    }
  }, [pattern]);

  const handleSave = async (values: RuleFormValues) => {
    let payload: { segments: number[]; createdBy: string };
    try {
      payload = {
        segments: parseSegments(values.pattern),
        createdBy: currentUser,
      };
    } catch (error: any) {
      message.error(error.message);
      return;
    }

    setSaving(true);
    try {
      const rule = await api.post('/account-code-rules', payload);
      setSavedRule(rule);
      message.success('科目编码规则已保存');
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%', maxWidth: 760 }}>
      <div>
        <h2 style={{ margin: 0 }}>科目编码规则</h2>
        <Text type="secondary">配置科目编码分段长度，用于校验会计科目编码。</Text>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{ pattern: '4-2-2-2' }}
        onFinish={handleSave}
        style={{ display: 'grid', gap: 8 }}
      >
        <Form.Item
          name="pattern"
          label="分段规则"
          rules={[
            { required: true, message: '请输入分段规则' },
            {
              validator: async (_, value) => {
                parseSegments(value);
              },
            },
          ]}
        >
          <Input placeholder="4-2-2-2" />
        </Form.Item>

        <Space wrap>
          <Button data-testid="account-code-rule-save" type="primary" icon={<SaveOutlined />} loading={saving} htmlType="submit">
            保存规则
          </Button>
        </Space>
      </Form>

      {preview.error ? (
        <Alert type="error" description={preview.error} showIcon />
      ) : (
        <Alert
          type="info"
          showIcon
          title="编码规则预览"
          description={
            <div style={{ display: 'grid', gap: 8 }}>
              <Text>分段：{preview.segments.join('-')}</Text>
              <Space size={4} wrap>
                <Text>允许的编码长度：</Text>
                {preview.allowedLengths.map((length) => (
                  <Tag key={length}>{length}</Tag>
                ))}
              </Space>
              <Text type="secondary">仅用于预览保存后的编码校验范围，点击信息图标不会触发额外操作。</Text>
            </div>
          }
        />
      )}

      {savedRule ? (
        <Alert
          type="success"
          showIcon
          description={`已保存规则 ${savedRule.segments.join('-')}，允许的科目编码长度为 ${savedRule.allowedLengths.join('、')}。`}
        />
      ) : null}
    </div>
  );
};
