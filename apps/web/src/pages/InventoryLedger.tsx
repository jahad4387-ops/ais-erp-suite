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
        <h2 style={{ margin: 0 }}>Inventory Ledger</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>Refresh</Button>
        </Space>
      </div>
      <Tabs
        items={[
          {
            key: 'balances',
            label: 'Balances',
            children: (
              <Table
                rowKey="id"
                loading={loading}
                dataSource={balances}
                columns={[
                  { title: 'Item', dataIndex: 'itemCode' },
                  { title: 'Warehouse', dataIndex: 'warehouseCode' },
                  { title: 'Location', dataIndex: 'locationCode' },
                  { title: 'Batch', dataIndex: 'batchNo' },
                  { title: 'Quantity', dataIndex: 'quantity' },
                  { title: 'Amount', dataIndex: 'amount' },
                  { title: 'Unit cost', dataIndex: 'unitCost' },
                ]}
              />
            ),
          },
          {
            key: 'layers',
            label: 'Cost layers',
            children: (
              <Table
                rowKey="id"
                loading={loading}
                dataSource={layers}
                columns={[
                  { title: 'Item', dataIndex: 'itemCode' },
                  { title: 'Warehouse', dataIndex: 'warehouseCode' },
                  { title: 'Batch', dataIndex: 'batchNo' },
                  { title: 'Received quantity', dataIndex: 'receivedQuantity' },
                  { title: 'Received amount', dataIndex: 'receivedAmount' },
                  { title: 'Remaining quantity', dataIndex: 'remainingQuantity' },
                  { title: 'Remaining amount', dataIndex: 'remainingAmount' },
                  { title: 'Status', dataIndex: 'status' },
                ]}
              />
            ),
          },
        ]}
      />
    </div>
  );
};
