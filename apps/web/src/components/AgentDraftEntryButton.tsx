import React from 'react';
import { Button } from 'antd';
import type { ButtonProps } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';

type AgentDraftEntryButtonProps = {
  draftType: string;
  sourceObjectType: string;
  sourceObjectId?: string | null;
  userInstruction: string;
  size?: ButtonProps['size'];
  children?: React.ReactNode;
};

export const AgentDraftEntryButton: React.FC<AgentDraftEntryButtonProps> = ({
  draftType,
  sourceObjectType,
  sourceObjectId,
  userInstruction,
  size,
  children = 'Agent 生成草稿',
}) => {
  const params = new URLSearchParams();
  params.set('draftType', draftType);
  params.set('sourceObjectType', sourceObjectType);
  if (sourceObjectId) {
    params.set('sourceObjectId', sourceObjectId);
  }
  params.set('userInstruction', userInstruction);

  return (
    <Link to={`/agent?${params.toString()}`}>
      <Button size={size} icon={<RobotOutlined />}>{children}</Button>
    </Link>
  );
};
