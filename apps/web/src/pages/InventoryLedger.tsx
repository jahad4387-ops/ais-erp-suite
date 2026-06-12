import React, { useCallback, useEffect, useState } from 'react';
import { Button, Space, Table, Tabs, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

type Balance = {
  id: string;
  itemCode: string;
  warehouseCode: string;
  locationCode?: string | null;
  batchNo?: string | null;
  quantity: number;
  amount: number;
  unitCost: number;
};

type CostLayer = {
  id: string;
  itemCode: string;
  warehouseCode: string;
  batchNo?: string | null;
  receivedQuantity: number;
  receivedAmount: number;
  remainingQuantity: number;
  remainingAmount: number;
  status: string;
};

const layerStatusLabel: Record<string, string> = {
  open: '未结清',
  closed: '已结清',
};

export const InventoryLedger: React.FC = () => {
  const { currentAccountSetId } = useAppContext();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [layers, setLayers] = useState<CostLayer[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const [balanceRows, layerRows] = await Promise.all([
        api.get(`/inventory-balances?accountSetId=${currentAccountSetId}`),
        api.get(`/inventory-cost-layers?accountSetId=${currentAccountSetId}`),
      ]);
      setBalances(balanceRows ?? []);
      setLayers(layerRows ?? []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>存货台账</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </div>
      <Tabs
        items={[
          {
            key: 'balances',
            label: '库存余额',
            children: (
              <Table
                rowKey="id"
                loading={loading}
                dataSource={balances}
                columns={[
                  { title: '存货', dataIndex: 'itemCode' },
                  { title: '仓库', dataIndex: 'warehouseCode' },
                  { title: '货位', dataIndex: 'locationCode' },
                  { title: '批次', dataIndex: 'batchNo' },
                  { title: '数量', dataIndex: 'quantity' },
                  { title: '金额', dataIndex: 'amount' },
                  { title: '单位成本', dataIndex: 'unitCost' },
                ]}
              />
            ),
          },
          {
            key: 'layers',
            label: '成本层',
            children: (
              <Table
                rowKey="id"
                loading={loading}
                dataSource={layers}
                columns={[
                  { title: '存货', dataIndex: 'itemCode' },
                  { title: '仓库', dataIndex: 'warehouseCode' },
                  { title: '批次', dataIndex: 'batchNo' },
                  { title: '入库数量', dataIndex: 'receivedQuantity' },
                  { title: '入库金额', dataIndex: 'receivedAmount' },
                  { title: '剩余数量', dataIndex: 'remainingQuantity' },
                  { title: '剩余金额', dataIndex: 'remainingAmount' },
                  { title: '状态', render: (_, row) => layerStatusLabel[row.status] ?? row.status },
                ]}
              />
            ),
          },
        ]}
      />
    </div>
  );
};
