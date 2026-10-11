import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import DOMPurify from 'dompurify'
import {
  AlertCircle,
  Archive,
  Bold,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FilePlus2,
  FileText,
  Globe,
  GraduationCap,
  GripVertical,
  Link2,
  LoaderCircle,
  Mail,
  MessageCircle,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  UserRound,
  X,
} from 'lucide-react'
import {
  resumeListSchema,
  resumeSchema,
  type ExperienceItem,
  type ResumeBase,
  type ResumeDocument,
  type ResumeSection,
  type SkillItem,
} from './shared/resume'
import './App.css'

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error'
type Toast = { id: string; tone: 'success' | 'error' | 'neutral'; message: string }
type PageSection = { sectionId: string; showTitle: boolean; itemIds: string[] }
type ResumePageData = { sections: PageSection[]; overflowLabels: string[] }

const createId = (prefix: string) =>
  `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

const clone = <T,>(value: T): T => structuredClone(value)

const stripSnapshots = (resume: ResumeDocument): ResumeBase => {
  const copy = clone(resume)
  const { snapshots: _snapshots, ...base } = copy
  return base
}

const cleanHtml = (html: string) =>
  DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['strong', 'b', 'a', 'br'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  })

const textFromHtml = (html: string) => {
  const holder = document.createElement('div')
  holder.innerHTML = cleanHtml(html)
  return holder.textContent?.trim() ?? ''
}

const safeLink = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

const formatTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

async function getApiError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { message?: string; error?: string }
    return body.message || body.error || fallback
  } catch {
    return fallback
  }
}

function confirmDelete(label: string, action: () => void) {
  if (window.confirm(`确定删除${label}吗？删除后可使用“撤销”按钮或 Ctrl+Z 恢复。`)) action()
}

function useDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

function IconButton({
  label,
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button className={`icon-button ${className}`} type="button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  )
}

function SortableCard({ id, className = '', children }: { id: string; className?: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} className={`sortable-card ${className}${isDragging ? ' is-dragging' : ''}`}>
      <button className="drag-handle" type="button" aria-label="拖拽排序" {...attributes} {...listeners}>
        <GripVertical size={16} />
      </button>
      <div className="sortable-content">{children}</div>
    </div>
  )
}

function RichTextEditor({ value, onChange, label }: { value: string; onChange: (html: string) => void; label: string }) {
  const editorRef = useRef<HTMLDivElement>(null)
  const selectionRef = useRef<Range | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState('')

  useEffect(() => {
    const node = editorRef.current
    const sanitized = cleanHtml(value)
    if (node && document.activeElement !== node && node.innerHTML !== sanitized) node.innerHTML = sanitized
  }, [value])

  const emit = () => {
    const node = editorRef.current
    if (!node) return
    const next = cleanHtml(node.innerHTML)
    if (node.innerHTML !== next) node.innerHTML = next
    onChange(next)
  }

  const captureSelection = () => {
    const selection = window.getSelection()
    if (selection?.rangeCount) selectionRef.current = selection.getRangeAt(0).cloneRange()
  }

  const applyBold = () => {
    editorRef.current?.focus()
    document.execCommand('bold')
    emit()
  }

  const openLink = () => {
    captureSelection()
    setLinkOpen(true)
  }

  const applyLink = () => {
    const editor = editorRef.current
    const range = selectionRef.current
    if (!editor || !range || !url.trim()) return
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.execCommand('createLink', false, safeLink(url))
    editor.querySelectorAll('a').forEach((link) => {
      link.target = '_blank'
      link.rel = 'noreferrer'
    })
    emit()
    setUrl('')
    setLinkOpen(false)
    editor.focus()
  }

  return (
    <div className="rich-editor">
      <div className="rich-toolbar" aria-label={`${label}格式工具`}>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={applyBold} aria-label="加粗">
          <Bold size={14} />
        </button>
        <button type="button" onMouseDown={captureSelection} onClick={openLink} aria-label="添加链接">
          <Link2 size={14} />
        </button>
      </div>
      <div
        ref={editorRef}
        className="rich-input"
        contentEditable
        role="textbox"
        aria-label={label}
        aria-multiline="true"
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
      />
      {linkOpen && (
        <div className="link-popover">
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" aria-label="链接地址" autoFocus />
          <button type="button" className="button compact primary" onClick={applyLink} disabled={!url.trim()}>
            应用
          </button>
          <IconButton label="关闭链接输入" onClick={() => setLinkOpen(false)}>
            <X size={14} />
          </IconButton>
        </div>
      )}
    </div>
  )
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <header>
          <h2 id="dialog-title">{title}</h2>
          <IconButton label="关闭" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  )
}

function ExperienceEditor({
  sectionId,
  item,
  onChange,
  onDelete,
}: {
  sectionId: string
  item: ExperienceItem
  onChange: (item: ExperienceItem) => void
  onDelete: () => void
}) {
  const sensors = useDragSensors()
  const patch = (values: Partial<ExperienceItem>) => onChange({ ...item, ...values })
  const updateBullet = (id: string, html: string) =>
    patch({ bullets: item.bullets.map((bullet) => (bullet.id === id ? { ...bullet, html } : bullet)) })
  const addBullet = () => patch({ bullets: [...item.bullets, { id: createId('bullet'), html: '' }] })
  const deleteBullet = (id: string) => confirmDelete('这条要点', () => patch({ bullets: item.bullets.filter((bullet) => bullet.id !== id) }))
  const reorderBullets = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const oldIndex = item.bullets.findIndex((bullet) => bullet.id === active.id)
    const newIndex = item.bullets.findIndex((bullet) => bullet.id === over.id)
    patch({ bullets: arrayMove(item.bullets, oldIndex, newIndex) })
  }

  return (
    <div className="experience-editor">
      <div className="item-heading">
        <span>经历条目</span>
        <IconButton label="删除经历条目" className="danger-quiet" onClick={() => confirmDelete('这条经历', onDelete)}>
          <Trash2 size={15} />
        </IconButton>
      </div>
      <div className="form-grid two-columns">
        <label>
          标题
          <input value={item.title} onChange={(event) => patch({ title: event.target.value })} />
        </label>
        <label>
          职责 / 角色
          <input value={item.role} onChange={(event) => patch({ role: event.target.value })} />
        </label>
        <label>
          日期
          <input value={item.date} onChange={(event) => patch({ date: event.target.value })} />
        </label>
        <label>
          链接
          <input value={item.link} onChange={(event) => patch({ link: event.target.value })} placeholder="example.com/project" />
        </label>
        <label>
          分隔符
          <select value={item.separator} onChange={(event) => patch({ separator: event.target.value as 'pipe' | 'slash' })}>
            <option value="pipe">竖线 |</option>
            <option value="slash">斜线 /</option>
          </select>
        </label>
      </div>
      <div className="subsection-label">
        <span>要点</span>
        <button type="button" className="text-button" onClick={addBullet}>
          <Plus size={14} /> 添加要点
        </button>
      </div>
      {item.bullets.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderBullets}>
          <SortableContext items={item.bullets.map((bullet) => bullet.id)} strategy={verticalListSortingStrategy}>
            <div className="nested-list">
              {item.bullets.map((bullet) => (
                <SortableCard key={bullet.id} id={bullet.id} className="bullet-editor">
                  <RichTextEditor value={bullet.html} onChange={(html) => updateBullet(bullet.id, html)} label="经历要点" />
                  <IconButton label="删除要点" className="inline-delete" onClick={() => deleteBullet(bullet.id)}>
                    <Trash2 size={14} />
                  </IconButton>
                </SortableCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <button type="button" className="empty-inline" onClick={addBullet}>此条目还没有要点，添加第一条</button>
      )}
      <span className="sr-only">所属板块 {sectionId}</span>
    </div>
  )
}

function SectionEditor({
  section,
  onChange,
  onDuplicate,
  onDelete,
}: {
  section: ResumeSection
  onChange: (section: ResumeSection) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const sensors = useDragSensors()

  const reorderItems = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const oldIndex = section.items.findIndex((item) => item.id === active.id)
    const newIndex = section.items.findIndex((item) => item.id === over.id)
    if (section.kind === 'skills') onChange({ ...section, items: arrayMove(section.items, oldIndex, newIndex) })
    else onChange({ ...section, items: arrayMove(section.items, oldIndex, newIndex) })
  }

  const addItem = () => {
    if (section.kind === 'skills') {
      const item: SkillItem = { id: createId('skill'), html: '', variant: 'bullet' }
      onChange({ ...section, items: [...section.items, item] })
    } else {
      const item: ExperienceItem = {
        id: createId('experience'),
        title: '',
        role: '',
        date: '',
        link: '',
        separator: 'pipe',
        bullets: [],
      }
      onChange({ ...section, items: [...section.items, item] })
    }
    setCollapsed(false)
  }

  return (
    <article className="section-editor-card">
      <header className="section-editor-header">
        <button type="button" className="collapse-button" onClick={() => setCollapsed((value) => !value)} aria-expanded={!collapsed}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          <span className="section-kind">{section.kind === 'experience' ? '经历型板块' : '技能列表型板块'}</span>
        </button>
        <div className="section-actions">
          <IconButton label="复制板块" onClick={onDuplicate}><Copy size={15} /></IconButton>
          <IconButton label="删除板块" className="danger-quiet" onClick={() => confirmDelete(`“${section.title}”板块`, onDelete)}><Trash2 size={15} /></IconButton>
        </div>
      </header>
      {!collapsed && (
        <div className="section-editor-body">
          <label>
            板块名称
            <input value={section.title} onChange={(event) => onChange({ ...section, title: event.target.value })} />
          </label>
          {section.items.length ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderItems}>
              <SortableContext items={section.items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <div className="item-editor-list">
                  {section.kind === 'skills'
                    ? section.items.map((item) => (
                        <SortableCard key={item.id} id={item.id} className="skill-editor">
                          <div className="skill-controls">
                            <select
                              aria-label="技能条目样式"
                              value={item.variant}
                              onChange={(event) =>
                                onChange({
                                  ...section,
                                  items: section.items.map((entry) =>
                                    entry.id === item.id ? { ...entry, variant: event.target.value as 'summary' | 'bullet' } : entry,
                                  ),
                                })
                              }
                            >
                              <option value="bullet">项目符号</option>
                              <option value="summary">摘要行</option>
                            </select>
                            <IconButton
                              label="删除技能条目"
                              className="danger-quiet"
                              onClick={() => confirmDelete('这条技能', () => onChange({ ...section, items: section.items.filter((entry) => entry.id !== item.id) }))}
                            >
                              <Trash2 size={14} />
                            </IconButton>
                          </div>
                          <RichTextEditor
                            value={item.html}
                            onChange={(html) =>
                              onChange({ ...section, items: section.items.map((entry) => (entry.id === item.id ? { ...entry, html } : entry)) })
                            }
                            label="技能条目"
                          />
                        </SortableCard>
                      ))
                    : section.items.map((item) => (
                        <SortableCard key={item.id} id={item.id} className="experience-sortable">
                          <ExperienceEditor
                            sectionId={section.id}
                            item={item}
                            onChange={(next) =>
                              onChange({ ...section, items: section.items.map((entry) => (entry.id === item.id ? next : entry)) })
                            }
                            onDelete={() => onChange({ ...section, items: section.items.filter((entry) => entry.id !== item.id) })}
                          />
                        </SortableCard>
                      ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <button type="button" className="empty-inline" onClick={addItem}>板块为空，添加第一条内容</button>
          )}
          <button type="button" className="button dashed" onClick={addItem}>
            <Plus size={15} /> {section.kind === 'experience' ? '添加经历条目' : '添加技能条目'}
          </button>
        </div>
      )}
    </article>
  )
}

function ResumeHeader({ resume }: { resume: ResumeDocument }) {
  const { person, education } = resume
  return (
    <header className="resume-header" data-measure-header>
      <div className="resume-identity">
        <div className="resume-name-line">
          <h1>{person.name}</h1>
          {person.role && <span>{person.role}</span>}
        </div>
        <div className="resume-education">
          <GraduationCap aria-hidden="true" />
          <span>{[education.graduation, education.major, education.school].filter(Boolean).join(' · ')}</span>
        </div>
        {(person.birth || person.city) && (
          <div className="resume-person-meta">
            {person.birth && <span><CalendarDays aria-hidden="true" />{person.birth}</span>}
            {person.city && <span><MapPin aria-hidden="true" />{person.city}</span>}
          </div>
        )}
      </div>
      <div className="resume-contact">
        {person.phone && <a href={`tel:${person.phone}`}><Phone aria-hidden="true" />{person.phone}</a>}
        {person.wechat && <span><MessageCircle aria-hidden="true" />{person.wechat}</span>}
        {person.email && <a href={`mailto:${person.email}`}><Mail aria-hidden="true" />{person.email}</a>}
        {person.website && <a href={safeLink(person.website)} target="_blank" rel="noreferrer"><Globe aria-hidden="true" />{person.website}</a>}
      </div>
      {person.photo && <img className="resume-photo" src={person.photo} alt={`${person.name || '候选人'}照片`} />}
    </header>
  )
}

function ResumeSectionTitle({ title, sectionId }: { title: string; sectionId?: string }) {
  return (
    <div className="resume-section-title measure-block" data-measure-section={sectionId}>
      <h2>{title}</h2>
      <span />
    </div>
  )
}

function SkillPreviewItem({ item, measure = false }: { item: SkillItem; measure?: boolean }) {
  return (
    <div className={`resume-block-item skill-preview ${item.variant}`} data-measure-item={measure ? item.id : undefined}>
      {item.variant === 'bullet' && <i aria-hidden="true" />}
      <div dangerouslySetInnerHTML={{ __html: cleanHtml(item.html) }} />
    </div>
  )
}

function ExperiencePreviewItem({ item, measure = false }: { item: ExperienceItem; measure?: boolean }) {
  const separator = item.separator === 'pipe' ? ' | ' : ' / '
  return (
    <article className="resume-block-item experience-preview" data-measure-item={measure ? item.id : undefined}>
      <div className={`experience-preview-heading${item.link ? ' has-link' : ''}`}>
        <div className="experience-preview-main">
          <h3>{item.title}</h3>
          <span>{[item.role, item.date].filter(Boolean).join(separator)}</span>
        </div>
        {item.link && <a className="experience-preview-link" href={safeLink(item.link)} target="_blank" rel="noreferrer">{item.link}</a>}
      </div>
      {item.bullets.length > 0 && (
        <ul>
          {item.bullets.map((bullet) => <li key={bullet.id} dangerouslySetInnerHTML={{ __html: cleanHtml(bullet.html) }} />)}
        </ul>
      )}
    </article>
  )
}

function MeasurementLayer({ resume, measureRef, gap }: { resume: ResumeDocument; measureRef: React.RefObject<HTMLDivElement | null>; gap: number }) {
  return (
    <div className="measurement-shell" aria-hidden="true">
      <div className="resume-content measurement-content" ref={measureRef} style={{ '--section-gap': `${gap}mm` } as CSSProperties}>
        <ResumeHeader resume={resume} />
        {resume.sections.map((section) => (
          <div className={`resume-section resume-section-${section.kind}`} key={section.id}>
            <ResumeSectionTitle title={section.title} sectionId={section.id} />
            {section.kind === 'skills'
              ? section.items.map((item) => <SkillPreviewItem key={item.id} item={item} measure />)
              : section.items.map((item) => <ExperiencePreviewItem key={item.id} item={item} measure />)}
          </div>
        ))}
      </div>
    </div>
  )
}

function resumeBodyKey(resume: ResumeDocument) {
  const { updatedAt: _updatedAt, ...rest } = resume
  return JSON.stringify(rest)
}

function buildPages(resume: ResumeDocument, root: HTMLDivElement): ResumePageData[] {
  const width = root.getBoundingClientRect().width
  if (!width) return [{ sections: [], overflowLabels: [] }]
  const pageCapacity = (width / 182) * 269
  const headerHeight = root.querySelector<HTMLElement>('[data-measure-header]')?.offsetHeight ?? 0
  const titleHeights = new Map<string, number>()
  const itemHeights = new Map<string, number>()
  root.querySelectorAll<HTMLElement>('[data-measure-section]').forEach((node) => titleHeights.set(node.dataset.measureSection ?? '', node.offsetHeight))
  root.querySelectorAll<HTMLElement>('[data-measure-item]').forEach((node) => itemHeights.set(node.dataset.measureItem ?? '', node.offsetHeight))

  type WorkingPage = ResumePageData & { used: number }
  const pages: WorkingPage[] = [{ sections: [], overflowLabels: [], used: headerHeight }]
  let page = pages[0]
  const newPage = () => {
    page = { sections: [], overflowLabels: [], used: 0 }
    pages.push(page)
  }
  const addFragment = (sectionId: string, showTitle: boolean) => {
    const fragment: PageSection = { sectionId, showTitle, itemIds: [] }
    page.sections.push(fragment)
    return fragment
  }

  for (const section of resume.sections) {
    const titleHeight = titleHeights.get(section.id) ?? 0
    const firstHeight = section.items[0] ? itemHeights.get(section.items[0].id) ?? 0 : 0
    if (page.used > 0 && titleHeight + firstHeight > pageCapacity - page.used) newPage()
    let fragment = addFragment(section.id, true)
    page.used += titleHeight

    for (const item of section.items) {
      const itemHeight = itemHeights.get(item.id) ?? 0
      const itemLabel = 'title' in item
        ? `${section.title} / ${item.title || '未命名经历'}`
        : `${section.title} / ${textFromHtml(item.html).slice(0, 24) || '空技能条目'}`
      if (itemHeight > pageCapacity) {
        if (fragment.itemIds.length || page.sections.length > 1 || page.used > titleHeight) {
          newPage()
          fragment = addFragment(section.id, false)
        }
        fragment.itemIds.push(item.id)
        page.overflowLabels.push(itemLabel)
        page.used += itemHeight
        continue
      }
      if (page.used + itemHeight > pageCapacity) {
        newPage()
        fragment = addFragment(section.id, false)
      }
      fragment.itemIds.push(item.id)
      page.used += itemHeight
    }
  }
  return pages.map(({ used: _used, ...entry }) => entry)
}

function usePagination(resume: ResumeDocument) {
  const measureRef = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState<ResumePageData[]>([{ sections: [], overflowLabels: [] }])
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const root = measureRef.current
    if (!root) return
    let frame = 0
    setReady(false)
    const calculate = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next = buildPages(resume, root)
        setPages((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next)
        setReady(true)
      })
    }
    calculate()
    const observer = new ResizeObserver(calculate)
    observer.observe(root)
    root.querySelectorAll('img').forEach((image) => image.addEventListener('load', calculate))
    document.fonts?.ready.then(calculate)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      root.querySelectorAll('img').forEach((image) => image.removeEventListener('load', calculate))
    }
  }, [resume])

  return { pages, measureRef, ready }
}

function ResumePage({ resume, data, pageNumber }: { resume: ResumeDocument; data: ResumePageData; pageNumber: number }) {
  return (
    <article className={`resume-page${data.overflowLabels.length ? ' has-overflow resume-overflow' : ''}`} data-overflow={data.overflowLabels.length ? 'true' : 'false'} aria-label={`简历第 ${pageNumber} 页`}>
      {data.overflowLabels.length > 0 && (
        <div className="overflow-marker" role="alert">
          <AlertCircle size={14} /> 页面溢出：{data.overflowLabels.join('、')}
        </div>
      )}
      <div className="resume-content">
        {pageNumber === 1 && <ResumeHeader resume={resume} />}
        {data.sections.map((fragment, index) => {
          const section = resume.sections.find((entry) => entry.id === fragment.sectionId)
          if (!section) return null
          return (
            <section className={`resume-section resume-section-${section.kind}`} key={`${fragment.sectionId}-${index}`}>
              {fragment.showTitle && <ResumeSectionTitle title={section.title} />}
              {section.kind === 'skills'
                ? section.items.filter((item) => fragment.itemIds.includes(item.id)).map((item) => <SkillPreviewItem key={item.id} item={item} />)
                : section.items.filter((item) => fragment.itemIds.includes(item.id)).map((item) => <ExperiencePreviewItem key={item.id} item={item} />)}
            </section>
          )
        })}
      </div>
      <span className="page-number">{pageNumber}</span>
    </article>
  )
}

function PreviewCanvas({ resume, onOverflowChange, onSectionGapChange }: { resume: ResumeDocument; onOverflowChange: (labels: string[]) => void; onSectionGapChange: (gap: number) => void }) {
  const { pages, measureRef, ready } = usePagination(resume)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const sectionGap = resume.sectionGap ?? 0
  const overflowLabels = useMemo(() => pages.flatMap((page) => page.overflowLabels), [pages])

  useEffect(() => onOverflowChange(overflowLabels), [overflowLabels, onOverflowChange])
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const resize = () => setScale(Math.min(1, Math.max(0.36, (viewport.clientWidth - 32) / 794)))
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  return (
    <div data-resume-id={resume.id} data-pagination-ready={ready ? 'true' : 'false'} data-overflow={overflowLabels.length ? 'true' : 'false'}>
      <MeasurementLayer resume={resume} measureRef={measureRef} gap={sectionGap} />
      <div className="preview-viewport" ref={viewportRef}>
        <div className="preview-meta">
          <span>{pages.length} 页 · A4</span>
          {overflowLabels.length ? <strong><AlertCircle size={14} /> {overflowLabels.length} 项溢出</strong> : <span className="fit-status"><Check size={14} /> 分页正常</span>}
          <label className="gap-control" title="调整板块标题上方的额外间距">
            板块间距
            <input
              type="number"
              min={-3}
              max={12}
              step={0.5}
              value={sectionGap}
              onChange={(event) => onSectionGapChange(Math.max(-3, Math.min(12, Number(event.target.value) || 0)))}
            />
            mm
          </label>
        </div>
        <div
          className="preview-scale-stage"
          style={{
            '--preview-scale': scale,
            height: `${(pages.length * 1122.52 + Math.max(0, pages.length - 1) * 20) * scale}px`,
          } as CSSProperties}
        >
          <div className="preview-pages" style={{ '--section-gap': `${sectionGap}mm` } as CSSProperties}>
            {pages.map((page, index) => <ResumePage key={index} resume={resume} data={page} pageNumber={index + 1} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [resumes, setResumes] = useState<ResumeDocument[]>([])
  const [current, setCurrent] = useState<ResumeDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [busyAction, setBusyAction] = useState('')
  const [overflowLabels, setOverflowLabels] = useState<string[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [renameTarget, setRenameTarget] = useState<ResumeDocument | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ResumeDocument | null>(null)
  const [deletedResume, setDeletedResume] = useState<ResumeDocument | null>(null)
  const [snapshotName, setSnapshotName] = useState('')
  const [snapshotDialogOpen, setSnapshotDialogOpen] = useState(false)
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const currentRef = useRef<ResumeDocument | null>(null)
  const pastRef = useRef<ResumeDocument[]>([])
  const futureRef = useRef<ResumeDocument[]>([])
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const serverSnapRef = useRef<Map<string, string>>(new Map())
  const saveStateRef = useRef(saveState)
  const sectionSensors = useDragSensors()

  const notify = useCallback((message: string, tone: Toast['tone'] = 'neutral') => {
    const toast = { id: createId('toast'), message, tone }
    setToasts((items) => [...items, toast])
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== toast.id)), 4200)
  }, [])

  const selectLocalResume = useCallback((resume: ResumeDocument) => {
    const copy = clone(resume)
    currentRef.current = copy
    setCurrent(copy)
    pastRef.current = []
    futureRef.current = []
    setHistoryState({ canUndo: false, canRedo: false })
    setSaveState('saved')
    setOverflowLabels([])
    try {
      window.localStorage.setItem('resume-editor-last-id', resume.id)
    } catch {
      // 忽略存储失败（如隐私模式）。
    }
  }, [])

  const loadResumes = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/api/resumes')
      if (!response.ok) throw new Error(await getApiError(response, '加载简历失败，请检查本地服务后重试。'))
      const parsed = resumeListSchema.safeParse(await response.json())
      if (!parsed.success) throw new Error('简历数据格式不正确，无法载入编辑器。')
      setResumes(parsed.data)
      serverSnapRef.current = new Map(parsed.data.map((resume) => [resume.id, resumeBodyKey(resume)]))
      const requestedId = new URLSearchParams(window.location.search).get('resume')
      let lastId: string | null = null
      try {
        lastId = window.localStorage.getItem('resume-editor-last-id')
      } catch {
        lastId = null
      }
      const requested = requestedId
        ? parsed.data.find((resume) => resume.id === requestedId)
        : undefined
      const remembered = !requestedId && lastId
        ? parsed.data.find((resume) => resume.id === lastId)
        : undefined
      const initial = requested ?? remembered ?? parsed.data[0]
      if (initial) {
        // 一次性迁移：把旧的 localStorage 全局间距值写进当前简历配置。
        let storedGap: number | null = null
        try {
          const raw = window.localStorage.getItem('resume-editor-section-gap')
          if (raw !== null) storedGap = Number(raw)
        } catch {
          storedGap = null
        }
        if (storedGap !== null && !Number.isNaN(storedGap) && initial.sectionGap !== storedGap) {
          initial.sectionGap = Math.max(-3, Math.min(12, storedGap))
          selectLocalResume(initial)
          // 标记未保存，交给自动保存效果写入磁盘。
          setSaveState('unsaved')
          try {
            window.localStorage.removeItem('resume-editor-section-gap')
          } catch {
            // 忽略清理失败。
          }
        } else {
          selectLocalResume(initial)
        }
      }
      else {
        setCurrent(null)
        currentRef.current = null
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '加载简历失败，请重试。')
    } finally {
      setLoading(false)
    }
  }, [selectLocalResume])

  useEffect(() => {
    document.title = 'Resume Builder'
    const timer = window.setTimeout(() => void loadResumes(), 0)
    return () => window.clearTimeout(timer)
  }, [loadResumes])

  useEffect(() => {
    saveStateRef.current = saveState
  }, [saveState])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch('/api/resumes')
          if (!response.ok) return
          const parsed = resumeListSchema.safeParse(await response.json())
          if (!parsed.success) return
          const incoming = parsed.data
          const snapshot = new Map(serverSnapRef.current)
          let changed = false
          for (const resume of incoming) {
            const key = resumeBodyKey(resume)
            if (snapshot.get(resume.id) !== key) changed = true
            snapshot.set(resume.id, key)
          }
          if (!changed && snapshot.size === serverSnapRef.current.size) return
          serverSnapRef.current = snapshot
          setResumes(incoming)
          const activeId = currentRef.current?.id
          const active = incoming.find((resume) => resume.id === activeId)
          if (!active) return
          if (resumeBodyKey(active) === resumeBodyKey(currentRef.current as ResumeDocument)) return
          if (saveStateRef.current !== 'saved') return
          const copy = clone(active)
          currentRef.current = copy
          setCurrent(copy)
          pastRef.current = []
          futureRef.current = []
          setHistoryState({ canUndo: false, canRedo: false })
          setSaveState('saved')
          setOverflowLabels([])
          notify('简历文件在磁盘上有更新，已载入最新版本。')
        } catch {
          // 轮询失败忽略，下个周期重试。
        }
      })()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [notify])

  const updateCurrent = useCallback((updater: (resume: ResumeDocument) => ResumeDocument) => {
    setCurrent((previous) => {
      if (!previous) return previous
      pastRef.current = [...pastRef.current.slice(-79), clone(previous)]
      futureRef.current = []
      const next = updater(clone(previous))
      next.updatedAt = new Date().toISOString()
      currentRef.current = next
      return next
    })
    setHistoryState({ canUndo: true, canRedo: false })
    setSaveState('unsaved')
  }, [])

  const persist = useCallback(async (document: ResumeDocument) => {
    if (currentRef.current?.id === document.id) setSaveState('saving')
    const response = await fetch(`/api/resumes/${encodeURIComponent(document.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(document),
    })
    if (!response.ok) {
      const message = await getApiError(response, '保存失败，请检查本地服务。')
      setSaveState('error')
      throw new Error(message)
    }
    const saved = (await response.json()) as ResumeDocument
    serverSnapRef.current.set(saved.id, resumeBodyKey(saved))
    setResumes((items) => items.map((item) => item.id === document.id ? saved : item))
    if (currentRef.current?.id === document.id && currentRef.current.updatedAt === document.updatedAt) setSaveState('saved')
    else if (currentRef.current?.id === document.id) setSaveState('unsaved')
  }, [])

  const queueSave = useCallback((document: ResumeDocument) => {
    const task = saveQueueRef.current.catch(() => undefined).then(() => persist(document))
    saveQueueRef.current = task.catch(() => undefined)
    return task
  }, [persist])

  useEffect(() => {
    if (!current || saveState !== 'unsaved') return
    const timer = window.setTimeout(() => {
      void queueSave(clone(current)).catch((error) => notify(error instanceof Error ? error.message : '自动保存失败。', 'error'))
    }, 900)
    return () => window.clearTimeout(timer)
  }, [current, saveState, queueSave, notify])

  const undo = useCallback(() => {
    const active = currentRef.current
    const previous = pastRef.current.pop()
    if (!active || !previous) return
    futureRef.current.push(clone(active))
    const next = { ...clone(previous), updatedAt: new Date().toISOString() }
    currentRef.current = next
    setCurrent(next)
    setSaveState('unsaved')
    setHistoryState({ canUndo: pastRef.current.length > 0, canRedo: true })
  }, [])

  const redo = useCallback(() => {
    const active = currentRef.current
    const nextHistory = futureRef.current.pop()
    if (!active || !nextHistory) return
    pastRef.current.push(clone(active))
    const next = { ...clone(nextHistory), updatedAt: new Date().toISOString() }
    currentRef.current = next
    setCurrent(next)
    setSaveState('unsaved')
    setHistoryState({ canUndo: true, canRedo: futureRef.current.length > 0 })
  }, [])

  useEffect(() => {
    const handleHistory = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handleHistory)
    return () => window.removeEventListener('keydown', handleHistory)
  }, [redo, undo])

  const createResume = async (source?: ResumeDocument) => {
    const now = new Date().toISOString()
    const document: ResumeDocument = source
      ? { ...clone(source), id: createId('resume'), title: `${source.title} - 副本`, updatedAt: now, snapshots: [] }
      : {
          id: createId('resume'),
          title: '未命名简历',
          updatedAt: now,
          person: { name: '', role: '', phone: '', email: '', wechat: '', website: '', birth: '', city: '', photo: '/assets/profile-photo.png' },
          education: { graduation: '', major: '', school: '' },
          sections: [],
          sectionGap: 0,
          snapshots: [],
        }
    setBusyAction(source ? `copy-${source.id}` : 'create')
    try {
      const response = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(document),
      })
      if (!response.ok) throw new Error(await getApiError(response, source ? '复制简历失败。' : '新建简历失败。'))
      let created = document
      if (response.headers.get('content-type')?.includes('application/json')) {
        const parsed = resumeSchema.safeParse(await response.json())
        if (parsed.success) created = parsed.data
      }
      setResumes((items) => [created, ...items])
      selectLocalResume(created)
      notify(source ? '副本已创建。' : '新简历已创建。', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : '操作失败，请重试。', 'error')
    } finally {
      setBusyAction('')
    }
  }

  const chooseResume = async (resume: ResumeDocument) => {
    if (resume.id === currentRef.current?.id) return
    const active = currentRef.current
    if (active && saveState !== 'saved') {
      try {
        await queueSave(clone(active))
      } catch (error) {
        notify(error instanceof Error ? error.message : '切换前保存失败。', 'error')
        return
      }
    }
    selectLocalResume(resume)
  }

  const renameResume = () => {
    if (!renameTarget || !renameValue.trim()) return
    if (renameTarget.id === currentRef.current?.id) {
      updateCurrent((resume) => ({ ...resume, title: renameValue.trim() }))
    } else {
      const next = { ...clone(renameTarget), title: renameValue.trim(), updatedAt: new Date().toISOString() }
      void queueSave(next)
        .then(() => notify('简历名称已更新。', 'success'))
        .catch((error) => notify(error instanceof Error ? error.message : '重命名失败。', 'error'))
    }
    setRenameTarget(null)
  }

  const deleteResume = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setBusyAction(`delete-${target.id}`)
    try {
      const response = await fetch(`/api/resumes/${encodeURIComponent(target.id)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(await getApiError(response, '删除简历失败。'))
      const remaining = resumes.filter((item) => item.id !== target.id)
      setResumes(remaining)
      setDeletedResume(target)
      if (currentRef.current?.id === target.id) {
        if (remaining[0]) selectLocalResume(remaining[0])
        else {
          currentRef.current = null
          setCurrent(null)
        }
      }
      window.setTimeout(() => setDeletedResume((value) => value?.id === target.id ? null : value), 8000)
    } catch (error) {
      notify(error instanceof Error ? error.message : '删除简历失败。', 'error')
    } finally {
      setDeleteTarget(null)
      setBusyAction('')
    }
  }

  const undoDelete = async () => {
    if (!deletedResume) return
    const document = deletedResume
    setBusyAction('undo-delete')
    try {
      const response = await fetch('/api/resumes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(document),
      })
      if (!response.ok) throw new Error(await getApiError(response, '撤销删除失败。'))
      setResumes((items) => [document, ...items])
      setDeletedResume(null)
      selectLocalResume(document)
      notify('已恢复删除的简历。', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : '撤销删除失败。', 'error')
    } finally {
      setBusyAction('')
    }
  }

  const exportPdf = async () => {
    if (!currentRef.current || overflowLabels.length) return
    setBusyAction('export')
    try {
      let saved: ResumeDocument | null = null
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const candidate: ResumeDocument | null = currentRef.current
        if (!candidate) return
        const copyToSave: ResumeDocument = clone(candidate)
        await queueSave(copyToSave)
        if (currentRef.current?.updatedAt === copyToSave.updatedAt) {
          saved = copyToSave
          break
        }
      }
      if (!saved) throw new Error('内容仍在变化，请停止编辑后再次导出。')
      const response = await fetch(`/api/export/${encodeURIComponent(saved.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Resume-Overflow': 'false' },
        body: JSON.stringify({ overflow: false }),
      })
      if (!response.ok) throw new Error(await getApiError(response, 'PDF 导出失败。'))
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = documentCreateAnchor(url, `${saved.person.name || '未命名'}-${saved.person.role || '简历'}-${saved.person.phone || '无手机号'}.pdf`)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      notify('PDF 已开始下载。', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'PDF 导出失败。', 'error')
    } finally {
      setBusyAction('')
    }
  }

  const createSnapshot = () => {
    if (!snapshotName.trim()) return
    updateCurrent((resume) => ({
      ...resume,
      snapshots: [...resume.snapshots, { id: createId('snapshot'), name: snapshotName.trim(), createdAt: new Date().toISOString(), data: stripSnapshots(resume) }],
    }))
    setSnapshotName('')
    setSnapshotDialogOpen(false)
    notify('快照已创建，将随简历自动保存。', 'success')
  }

  const restoreSnapshot = (snapshotId: string) => {
    updateCurrent((resume) => {
      const snapshot = resume.snapshots.find((entry) => entry.id === snapshotId)
      return snapshot ? { ...clone(snapshot.data), snapshots: resume.snapshots, updatedAt: new Date().toISOString() } : resume
    })
    notify('快照内容已恢复。', 'success')
  }

  const uploadPhoto = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      notify('请选择图片文件。', 'error')
      return
    }
    if (file.size > 3_500_000) {
      notify('照片文件过大，请选择 3.5MB 以内的图片。', 'error')
      return
    }
    const reader = new FileReader()
    reader.onerror = () => notify('照片读取失败，请重试。', 'error')
    reader.onload = () => updateCurrent((resume) => ({ ...resume, person: { ...resume.person, photo: String(reader.result) } }))
    reader.readAsDataURL(file)
  }

  const updateSection = (section: ResumeSection) =>
    updateCurrent((resume) => ({ ...resume, sections: resume.sections.map((entry) => entry.id === section.id ? section : entry) }))

  const duplicateSection = (section: ResumeSection) => {
    const sectionId = createId('section')
    const title = `${section.title} - 副本`
    const copy: ResumeSection = section.kind === 'skills'
      ? {
          ...clone(section),
          id: sectionId,
          title,
          items: section.items.map((item) => ({ ...clone(item), id: createId('skill') })),
        }
      : {
          ...clone(section),
          id: sectionId,
          title,
          items: section.items.map((item) => ({
            ...clone(item),
            id: createId('experience'),
            bullets: item.bullets.map((bullet) => ({ ...clone(bullet), id: createId('bullet') })),
          })),
        }
    updateCurrent((resume) => {
      const index = resume.sections.findIndex((entry) => entry.id === section.id)
      const sections = [...resume.sections]
      sections.splice(index + 1, 0, copy)
      return { ...resume, sections }
    })
  }

  const addSection = (kind: ResumeSection['kind']) => {
    const section: ResumeSection = kind === 'experience'
      ? { id: createId('section'), title: '新经历板块', kind, items: [] }
      : { id: createId('section'), title: '新技能板块', kind, items: [] }
    updateCurrent((resume) => ({ ...resume, sections: [...resume.sections, section] }))
  }

  const reorderSections = ({ active, over }: DragEndEvent) => {
    if (!current || !over || active.id === over.id) return
    const oldIndex = current.sections.findIndex((section) => section.id === active.id)
    const newIndex = current.sections.findIndex((section) => section.id === over.id)
    updateCurrent((resume) => ({ ...resume, sections: arrayMove(resume.sections, oldIndex, newIndex) }))
  }

  const saveLabel = {
    saved: ['已保存', <CheckCircle2 size={14} key="icon" />],
    unsaved: ['等待保存', <ClockIcon key="icon" />],
    saving: ['正在保存', <LoaderCircle className="spin" size={14} key="icon" />],
    error: ['保存失败', <AlertCircle size={14} key="icon" />],
  }[saveState]

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-identity"><FileText size={19} /><span>简历编辑器</span><small>本地工作区</small></div>
        <div className={`save-indicator ${saveState}`}>{saveLabel[1]}<span>{saveLabel[0]}</span></div>
        <div className="app-actions">
          <IconButton label="撤销（Ctrl+Z）" onClick={undo} disabled={!historyState.canUndo}><Undo2 size={17} /></IconButton>
          <IconButton label="重做（Ctrl+Y）" onClick={redo} disabled={!historyState.canRedo}><Redo2 size={17} /></IconButton>
          <button className="button secondary" type="button" onClick={() => setSnapshotDialogOpen(true)} disabled={!current}>
            <Archive size={16} /> 保存快照
          </button>
          <button className="button primary" type="button" onClick={() => void exportPdf()} disabled={!current || !!overflowLabels.length || busyAction === 'export'} title={overflowLabels.length ? '存在超出单页的条目，修正后才能导出' : '导出 PDF'}>
            {busyAction === 'export' ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />} 导出 PDF
          </button>
        </div>
      </header>

      {loading ? (
        <main className="status-screen" aria-live="polite"><LoaderCircle className="spin" /><h1>正在载入本地简历</h1><p>正在连接本地数据服务…</p></main>
      ) : loadError ? (
        <main className="status-screen error" role="alert"><AlertCircle /><h1>无法载入简历</h1><p>{loadError}</p><button className="button primary" type="button" onClick={() => void loadResumes()}>重新加载</button></main>
      ) : (
        <main className="workspace">
          <aside className="resume-sidebar" aria-label="简历列表">
            <div className="sidebar-heading">
              <div><span>简历</span><small>{resumes.length} 份</small></div>
              <IconButton label="新建简历" onClick={() => void createResume()} disabled={busyAction === 'create'}>
                {busyAction === 'create' ? <LoaderCircle className="spin" size={16} /> : <FilePlus2 size={16} />}
              </IconButton>
            </div>
            {resumes.length ? (
              <div className="resume-list">
                {resumes.map((resume, index) => (
                  <div className={`resume-list-item${current?.id === resume.id ? ' selected' : ''}`} key={resume.id} style={{ '--item-index': index } as CSSProperties}>
                    <button className="resume-select" type="button" onClick={() => void chooseResume(resume)} aria-current={current?.id === resume.id ? 'page' : undefined}>
                      <span>{resume.title}</span>
                      <small>{resume.person.name || '未填写姓名'} · {formatTime(resume.updatedAt)}</small>
                    </button>
                    <div className="resume-item-actions">
                      <IconButton label={`重命名 ${resume.title}`} onClick={() => { setRenameTarget(resume); setRenameValue(resume.title) }}><Pencil size={13} /></IconButton>
                      <IconButton label={`复制 ${resume.title}`} onClick={() => void createResume(resume)} disabled={busyAction === `copy-${resume.id}`}><Copy size={13} /></IconButton>
                      <IconButton label={`删除 ${resume.title}`} className="danger-quiet" onClick={() => setDeleteTarget(resume)}><Trash2 size={13} /></IconButton>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="sidebar-empty"><FileText size={22} /><p>还没有简历</p><button type="button" className="button secondary" onClick={() => void createResume()}>新建第一份</button></div>
            )}
          </aside>

          {current ? (
            <>
              <section className="editor-panel" aria-label="简历表单编辑区">
                <div className="editor-panel-heading">
                  <div><span>内容编辑</span><small>{current.title}</small></div>
                  <span className="shortcut-hint">Ctrl Z / Y</span>
                </div>
                <div className="editor-scroll">
                  <section className="editor-card">
                    <div className="card-heading"><UserRound size={16} /><h2>个人信息</h2></div>
                    <div className="photo-row">
                      <img src={current.person.photo || '/assets/profile-photo.png'} alt="当前简历照片" />
                      <label className="button secondary photo-upload"><Camera size={15} /> 更换照片<input type="file" accept="image/*" onChange={(event) => uploadPhoto(event.target.files?.[0])} /></label>
                    </div>
                    <div className="form-grid two-columns">
                      {([
                        ['name', '姓名'], ['role', '求职岗位'], ['city', '意向城市'], ['phone', '手机号'],
                        ['email', '邮箱'], ['wechat', '微信'], ['website', '个人网站'], ['birth', '出生年月'],
                      ] as const).map(([key, label]) => (
                        <label key={key}>{label}<input value={current.person[key]} onChange={(event) => updateCurrent((resume) => ({ ...resume, person: { ...resume.person, [key]: event.target.value } }))} /></label>
                      ))}
                    </div>
                  </section>

                  <section className="editor-card">
                    <div className="card-heading"><GraduationCap size={16} /><h2>教育信息</h2></div>
                    <div className="form-grid three-columns">
                      {([
                        ['graduation', '毕业届别'], ['major', '专业'], ['school', '学校'],
                      ] as const).map(([key, label]) => (
                        <label key={key}>{label}<input value={current.education[key]} onChange={(event) => updateCurrent((resume) => ({ ...resume, education: { ...resume.education, [key]: event.target.value } }))} /></label>
                      ))}
                    </div>
                  </section>

                  <div className="sections-heading">
                    <div><h2>内容板块</h2><span>拖拽调整版面顺序</span></div>
                    <div className="add-section-actions">
                      <button type="button" className="button secondary compact" onClick={() => addSection('experience')}><Plus size={14} /> 经历型</button>
                      <button type="button" className="button secondary compact" onClick={() => addSection('skills')}><Plus size={14} /> 技能列表型</button>
                    </div>
                  </div>

                  {current.sections.length ? (
                    <DndContext sensors={sectionSensors} collisionDetection={closestCenter} onDragEnd={reorderSections}>
                      <SortableContext items={current.sections.map((section) => section.id)} strategy={verticalListSortingStrategy}>
                        <div className="section-editor-list">
                          {current.sections.map((section) => (
                            <SortableCard key={section.id} id={section.id} className="section-sortable">
                              <SectionEditor
                                section={section}
                                onChange={updateSection}
                                onDuplicate={() => duplicateSection(section)}
                                onDelete={() => updateCurrent((resume) => ({ ...resume, sections: resume.sections.filter((entry) => entry.id !== section.id) }))}
                              />
                            </SortableCard>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <div className="editor-empty"><FileText size={22} /><p>添加板块后，内容会实时出现在右侧 A4 预览中。</p></div>
                  )}

                  <section className="editor-card snapshots-card">
                    <div className="card-heading"><Archive size={16} /><h2>版本快照</h2><button type="button" className="text-button push-right" onClick={() => setSnapshotDialogOpen(true)}><Plus size={14} /> 新建快照</button></div>
                    {current.snapshots.length ? (
                      <div className="snapshot-list">
                        {[...current.snapshots].reverse().map((snapshot) => (
                          <div className="snapshot-row" key={snapshot.id}>
                            <div><strong>{snapshot.name}</strong><small>{formatTime(snapshot.createdAt)}</small></div>
                            <div>
                              <button type="button" className="text-button" onClick={() => restoreSnapshot(snapshot.id)}><RotateCcw size={13} /> 恢复</button>
                              <IconButton label={`删除快照 ${snapshot.name}`} className="danger-quiet" onClick={() => updateCurrent((resume) => ({ ...resume, snapshots: resume.snapshots.filter((entry) => entry.id !== snapshot.id) }))}><Trash2 size={14} /></IconButton>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="muted-copy">还没有快照。快照保存当前整份简历内容，可随时恢复。</p>}
                  </section>
                </div>
              </section>

              <section className="preview-panel" aria-label="A4 实时预览">
                <div className="preview-panel-heading">
                  <div><span>A4 实时预览</span><small>210 × 297 mm</small></div>
                  {overflowLabels.length > 0 && <span className="preview-warning"><AlertCircle size={14} /> 请修正溢出条目</span>}
                </div>
                <PreviewCanvas resume={current} onOverflowChange={setOverflowLabels} onSectionGapChange={(gap) => updateCurrent((doc) => ({ ...doc, sectionGap: gap }))} />
              </section>
            </>
          ) : (
            <section className="workspace-empty"><FilePlus2 size={28} /><h1>新建一份简历开始编辑</h1><p>内容保存在本地服务中。</p><button className="button primary" type="button" onClick={() => void createResume()}>新建简历</button></section>
          )}
        </main>
      )}

      {renameTarget && (
        <Dialog title="重命名简历" onClose={() => setRenameTarget(null)}>
          <div className="dialog-body"><label>简历名称<input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && renameResume()} /></label></div>
          <footer><button className="button secondary" type="button" onClick={() => setRenameTarget(null)}>取消</button><button className="button primary" type="button" disabled={!renameValue.trim()} onClick={renameResume}>保存名称</button></footer>
        </Dialog>
      )}
      {deleteTarget && (
        <Dialog title="删除简历" onClose={() => setDeleteTarget(null)}>
          <div className="dialog-body"><p>确定删除“{deleteTarget.title}”吗？删除后可在 8 秒内撤销。</p></div>
          <footer><button className="button secondary" type="button" onClick={() => setDeleteTarget(null)}>取消</button><button className="button danger" type="button" onClick={() => void deleteResume()} disabled={busyAction === `delete-${deleteTarget.id}`}>{busyAction ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />} 删除</button></footer>
        </Dialog>
      )}
      {snapshotDialogOpen && (
        <Dialog title="保存当前快照" onClose={() => setSnapshotDialogOpen(false)}>
          <div className="dialog-body"><label>快照名称<input autoFocus value={snapshotName} onChange={(event) => setSnapshotName(event.target.value)} placeholder="例如：投递游戏客户端岗位" onKeyDown={(event) => event.key === 'Enter' && createSnapshot()} /></label><p className="field-hint">快照包含当前个人信息、教育与全部内容板块。</p></div>
          <footer><button className="button secondary" type="button" onClick={() => setSnapshotDialogOpen(false)}>取消</button><button className="button primary" type="button" disabled={!snapshotName.trim()} onClick={createSnapshot}><Save size={15} /> 保存快照</button></footer>
        </Dialog>
      )}

      {deletedResume && (
        <div className="undo-toast" role="status"><span>“{deletedResume.title}”已删除</span><button type="button" onClick={() => void undoDelete()} disabled={busyAction === 'undo-delete'}>{busyAction === 'undo-delete' ? <LoaderCircle className="spin" size={14} /> : <Undo2 size={14} />} 撤销</button></div>
      )}
      <div className="toast-region" aria-live="polite">
        {toasts.map((toast) => <div key={toast.id} className={`toast ${toast.tone}`}>{toast.tone === 'success' ? <CheckCircle2 size={16} /> : toast.tone === 'error' ? <AlertCircle size={16} /> : <FileText size={16} />}<span>{toast.message}</span></div>)}
      </div>
    </div>
  )
}

function ClockIcon() {
  return <span className="unsaved-dot" aria-hidden="true" />
}

function documentCreateAnchor(url: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.replace(/[\\/:*?"<>|]/g, '-')
  document.body.appendChild(anchor)
  return anchor
}

export default App
