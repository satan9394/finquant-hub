import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Input, List, Space, Spin, Tag, Typography, message } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';

import AlphaTemplateCatalog from './AlphaTemplateCatalog';
import AlphaSimulationWorkbench from './AlphaSimulationWorkbench';
import TaskPageHeader from '../TaskPageHeader';
import { readAlphaStudies } from '../../features/alpha/studies';
import { readProfessionalPreferences, updateProfessionalPreferences } from '../../features/professionalPreferences';
import {
  fetchAlphaCatalog, searchAlpha, type AlphaCatalogueMetadata, type AlphaCategory, type AlphaSearchResult, type AlphaTemplate,
} from '../../services/alphaApi';

const { Text, Paragraph } = Typography;

/**
 * Alpha 因子研究工作台（Discover ?mode=alpha 面板）。
 * 从已回收的独立 AlphaResearch 页面收敛而来：真实字段类别 → 模板 → 本地模拟/相关性 → 保存/恢复，
 * 字段搜索保留为专业入口。选择不会自动模拟或提交。
 */
export default function AlphaResearchPanel() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AlphaSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [categories, setCategories] = useState<AlphaCategory[]>([]);
  const [templates, setTemplates] = useState<AlphaTemplate[]>([]);
  const [catalogue, setCatalogue] = useState<AlphaCatalogueMetadata | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preferredTemplateId, setPreferredTemplateId] = useState(() => readProfessionalPreferences().alphaTemplateId);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const catalog = await fetchAlphaCatalog();
      const savedTemplateId = readProfessionalPreferences().alphaTemplateId;
      setCategories(catalog.categories);
      setTemplates(catalog.templates);
      setCatalogue(catalog.catalogue);
      setPreferredTemplateId(savedTemplateId);
      setSelectedId((current) => (
        catalog.templates.some((template) => template.id === current)
          ? current
          : catalog.templates.some((template) => template.id === savedTemplateId)
            ? savedTemplateId
            : readAlphaStudies().find((study) => (
              catalog.templates.some((template) => template.id === study.templateId)
            ))?.templateId ?? null
      ));
    } catch (error: any) {
      setCategories([]);
      setTemplates([]);
      setCatalogue(null);
      setCatalogError(error.message || 'Alpha 类别与模板加载失败');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const search = useCallback(async (keyword: string) => {
    setSearchLoading(true);
    setSearchError(null);
    try {
      setItems(await searchAlpha(keyword));
    } catch (error: any) {
      setItems([]);
      setSearchError(error.message || 'Alpha 字段搜索失败');
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const selected = templates.find((template) => template.id === selectedId);
  const savePreferredTemplate = () => {
    if (!selected) return;
    const saved = updateProfessionalPreferences({ alphaTemplateId: selected.id });
    setPreferredTemplateId(saved.alphaTemplateId);
    message.success('已保存为常用研究模板');
  };
  const clearPreferredTemplate = () => {
    updateProfessionalPreferences({ alphaTemplateId: null });
    setPreferredTemplateId(null);
    message.success('已清除常用研究模板');
  };
  const status = catalogLoading
    ? '正在加载真实字段目录'
    : catalogError
      ? '类别与模板不可用'
      : `${catalogue?.data_status ?? 'UNKNOWN'} · ${categories.length} 类 · ${templates.length} 个可用模板`;

  return (
    <section className="product-page" data-testid="alpha-research" aria-label="Alpha 因子研究">
      <TaskPageHeader
        eyebrow="ALPHA RESEARCH · LOCAL FIRST"
        title="Alpha 因子研究"
        goal="先从真实字段类别和可解释模板形成假设，再用本地观察数据验证；选择不会自动模拟或提交。"
        object={selected?.name ?? '尚未选择模板'}
        status={status}
        statusTone={catalogLoading ? 'loading' : catalogError ? 'error' : catalogue?.data_status === 'PARTIAL' ? 'warning' : 'success'}
      />

      {!catalogLoading && !catalogError && catalogue && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={catalogue.mode === 'FINQUANT_STARTER' ? '当前使用可分发 starter catalogue（PARTIAL）' : '检测到本地扩展目录；再分发许可仍为 UNKNOWN'}
          description={catalogue.mode === 'FINQUANT_STARTER'
            ? `来源 ${catalogue.source} · ${catalogue.field_count} 个项目自有通用字段 · coverage 保持 UNKNOWN。五个模板可用，但这不是 WorldQuant 完整目录。`
            : `来源 ${catalogue.source} · ${catalogue.field_count} 个本地字段 · 内容可读取不代表允许公开再分发。`}
        />
      )}

      {catalogLoading ? (
        <Card className="surface-card"><Spin /> <Text>正在读取 `/wq/categories` 与 `/wq/templates`…</Text></Card>
      ) : catalogError ? (
        <Alert
          type="error"
          showIcon
          message="Alpha 类别与模板不可用"
          description={catalogError}
          action={<Button icon={<ReloadOutlined />} onClick={() => void loadCatalog()}>重试</Button>}
        />
      ) : categories.length && templates.length ? (
        <AlphaTemplateCatalog categories={categories} templates={templates} selectedId={selectedId} onSelect={setSelectedId} />
      ) : (
        <Empty description="接口未返回类别或模板；不会用静态数据替代。" />
      )}

      {selected && (
        <Card
          size="small"
          title="常用研究模板"
          className="surface-card"
          style={{ marginTop: 12 }}
          extra={(
            <Space wrap>
              <Button
                type={preferredTemplateId === selected.id ? 'default' : 'primary'}
                disabled={preferredTemplateId === selected.id}
                onClick={savePreferredTemplate}
              >
                {preferredTemplateId === selected.id ? '当前常用模板' : '保存为常用模板'}
              </Button>
              {preferredTemplateId && <Button onClick={clearPreferredTemplate}>清除常用模板</Button>}
            </Space>
          )}
        >
          <Text type="secondary">只保存真实目录模板 ID；不会保存观察输入、自动模拟或远端提交。</Text>
        </Card>
      )}

      {!catalogLoading && !catalogError && <AlphaSimulationWorkbench template={selected ?? null} />}

      <Card title="4. 搜索全部字段与经典 Alpha" className="surface-card" style={{ marginTop: 18 }}>
        <Text type="secondary">搜索保留为专业入口；结果来自项目打包目录与经典 Alpha 库，不执行模拟或提交。</Text>
        <Input.Search
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onSearch={(value) => void search(value.trim())}
          enterButton={<><SearchOutlined /> 检索</>}
          placeholder="例如 operating_income、momentum、Alpha001"
          allowClear
          loading={searchLoading}
          style={{ marginTop: 12 }}
        />
        {searchError && <Alert type="error" showIcon message="字段搜索失败" description={searchError} style={{ marginTop: 12 }} />}
        <List
          loading={searchLoading}
          dataSource={items}
          locale={{ emptyText: query ? '未找到匹配字段，请换用英文 ID、指标名称或 Alpha 编号。' : '输入关键词开始检索。' }}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={<span><Text strong>{item.name}</Text> <Tag>{item.type === 'wq_field' ? '数据字段' : item.type === 'alpha' ? '经典 Alpha' : '自定义字段'}</Tag></span>}
                description={(
                  <div>
                    <Paragraph style={{ marginBottom: 4 }}>{item.desc || '暂无描述'}</Paragraph>
                    {item.field && <Text type="secondary">字段 ID：{item.field}</Text>}
                    {item.formula && <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '6px 0 0', fontSize: 12 }}>{item.formula}</pre>}
                    {(item.dataset || item.category || item.region) && <div style={{ marginTop: 6 }}>
                      {item.dataset && <Tag>{item.dataset}</Tag>}
                      {item.category && <Tag>{item.category}</Tag>}
                      {item.region && <Tag>{item.region}</Tag>}
                    </div>}
                  </div>
                )}
              />
            </List.Item>
          )}
        />
      </Card>
    </section>
  );
}
