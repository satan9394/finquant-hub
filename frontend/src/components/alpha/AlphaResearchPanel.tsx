import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Empty, Input, List, Space, Spin, Tag, Typography, message } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';

import AlphaTemplateCatalog from './AlphaTemplateCatalog';
import AlphaSimulationWorkbench from './AlphaSimulationWorkbench';
import TaskPageHeader from '../TaskPageHeader';
import LoadFailureAlert, { LoadStateView, readStateOf } from '../LoadFailureAlert';
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
  // VS36：检索块的状态**按查询词作用域**（同族范式：VS-32 的 `detailErrorId`，27233a4）。
  // 修前 `searchError` 是一个无归属的字符串，正确性完全依赖"发起新请求时 `setSearchError(null)`"
  // —— 换个查询词时上一词的失败原文会挂在新词上（与 F1"42 的错误原文出现在 43 上"同形）。
  // 这里给"结果 / 失败"各自补上**它属于哪个查询词**，渲染处只认"属于输入框当前词"的那一份：
  //   `searchFailed` 是判据（不用"错误文案非空"当判据：底层错误可能没有 message，见 VS-29）。
  const [searchFailed, setSearchFailed] = useState(false);
  const [itemsKeyword, setItemsKeyword] = useState('');
  const [errorKeyword, setErrorKeyword] = useState('');
  const searchRequestId = useRef(0);
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
    const id = ++searchRequestId.current;
    setSearchLoading(true);
    // 只把"当前查询词"切到新词上；上一词的结果/失败因归属不匹配而**自动**不再渲染
    // —— 不靠"发起时清"来掩盖串场，因此也不存在"清在提交之后"留下的一帧旧内容。
    try {
      const results = await searchAlpha(keyword);
      // 迟到的成功不得覆盖新词的检索（否则新词会显示上一词的结果）。
      if (id !== searchRequestId.current) return;
      setItems(results);
      setItemsKeyword(keyword);
      // "成功才清失败态"（VS-32 口径）：重试期间失败态保持可见，成功后才消失。
      setSearchFailed(false);
      setSearchError(null);
      setErrorKeyword('');
    } catch (error: any) {
      // 迟到的失败不得挂到新词上：它属于发起它的那个查询词。
      if (id !== searchRequestId.current) return;
      setItems([]);
      setSearchFailed(true);
      setSearchError(error.message || 'Alpha 字段搜索失败');
      setErrorKeyword(keyword);
    } finally {
      if (id === searchRequestId.current) setSearchLoading(false);
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

  // VS36：检索块的**当前实体**就是输入框里的那个查询词；下面的结果/失败/空态只认"属于它"的那一份。
  // 换词（或改动输入框）⇒ 上一词的状态自动退出视野；切回去仍然显示它自己的状态（归属信息没有被丢掉）。
  const currentKeyword = query.trim();
  const scopedItems = itemsKeyword === currentKeyword ? items : [];
  const scopedSearchFailed = searchFailed && errorKeyword === currentKeyword;
  const searchState = readStateOf({
    failed: scopedSearchFailed,
    // `resolved` 只认"属于当前查询词的一次成功读取"（失败过的读取不是结论）。
    resolved: itemsKeyword === currentKeyword,
    count: scopedItems.length,
    // error 只在 failed 为真时被 readStateOf 读取，而 failed 已按查询词作用域 ⇒ 不会串台。
    error: searchError,
  });

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
        {/* VS36：检索结果的三态（加载中 / 空 / 失败）交给 VS-29 的**唯一**渲染出口
            `LoadStateView`（错误分支内部固定转调族内唯一的 `LoadFailureAlert`），不再自己拼
            "错误横幅 + 空文案"两段条件渲染 —— 修前失败时 `searchError` 与"未找到匹配字段"
            会同时出现在屏幕上，等于把失败冒充成"确实没有"。 */}
        <LoadStateView
          state={searchState}
          failureMessage="字段搜索失败"
          // 重试**真的重发**：同一个查询词再发一次（不是只把错误藏起来）。
          onRetry={() => void search(currentKeyword)}
          loadingText="正在检索字段…"
          emptyContent={<Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={currentKeyword ? '未找到匹配字段，请换用英文 ID、指标名称或 Alpha 编号。' : '输入关键词开始检索。'} />}
        >
          <List
            dataSource={scopedItems}
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
        </LoadStateView>
      </Card>
    </section>
  );
}
