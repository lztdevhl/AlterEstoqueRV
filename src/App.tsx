import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Session } from '@supabase/supabase-js'
import {
  AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpFromLine, BarChart3, Boxes, Check,
  ClipboardList, Download, Edit3, Eye, EyeOff, Filter, LockKeyhole, Mail, Menu, Package, PanelLeftClose, PanelLeftOpen, Plus, RotateCcw, Search,
  ShieldCheck, SlidersHorizontal, Sprout, Trash2, Truck, UploadCloud, FileSpreadsheet, History, Save, UsersRound, X, XCircle,
} from 'lucide-react'
import { InventoryError } from './lib/inventory'
import { csvCell, formatDateTime, formatNumber, quantityLabel, stockByUnit } from './lib/format'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { confirmSupabaseImportBatch, createSupabaseImportBatch, deleteSupabaseCustomer, loadSupabaseInventory, registerSupabaseMovement, saveSupabaseCustomer, saveSupabaseExternalMapping, saveSupabaseProduct, updateSupabaseImportRows } from './lib/supabaseRepository'
import { calculateImportProjection, DEFAULT_OPERATION_RULES, parseReportRows, type ImportFilter, type ImportRow, type ImportParseResult, type OperationRule, type ProductExternalMapping } from './lib/importParser'
import { readUniversalFiles } from './lib/importFormats'
import { categories, units, type Customer, type CustomerForm, type ImportBatch, type Movement, type MovementForm, type Product, type ProductForm, type MovementType } from './lib/types'
import dashboardMockup from '../references/1.png'

type View = 'dashboard' | 'produtos' | 'clientes' | 'movimentacoes' | 'importacoes' | 'relatorios'
type ProductStockFilter = 'todos' | 'disponivel' | 'baixo' | 'zerado'

const emptyCustomerForm: CustomerForm = {
  name: '', document: '', phone: '', email: '', notes: '', active: true,
}

const emptyProductForm: ProductForm = {
  name: '', sku: '', imageUrl: '', category: 'Protecocho', description: '', unit: '', quantity: '', minStock: '', location: '', active: true,
}
const emptyMovementForm: MovementForm = {
  type: 'entrada', productId: '', quantity: '', reason: '', destination: '', reference: '', notes: '', customerId: '', isSale: false,
}

const viewMeta: Record<View, { title: string; description: string }> = {
  importacoes: { title: 'Importar relatórios', description: 'Processe, revise e confirme operações sem lançamentos manuais.' },
  dashboard: { title: 'Visão geral', description: 'Acompanhe o pulso do seu estoque.' },
  produtos: { title: 'Produtos', description: 'Catálogo, saldos e níveis de reposição.' },
  clientes: { title: 'Clientes', description: 'Cadastre clientes e acompanhe as vendas vinculadas a cada um.' },
  movimentacoes: { title: 'Movimentações', description: 'Registre e audite cada movimentação.' },
  relatorios: { title: 'Relatórios', description: 'Encontre respostas rápidas para a operação.' },
}

function App() {
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([])
  const [productMappings, setProductMappings] = useState<ProductExternalMapping[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const [view, setView] = useState<View>('dashboard')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [productModal, setProductModal] = useState<{ open: boolean; product?: Product }>({ open: false })
  const [customerModal, setCustomerModal] = useState<{ open: boolean; customer?: Customer }>({ open: false })
  const [movementModal, setMovementModal] = useState(false)
  const [movementDraft, setMovementDraft] = useState<MovementForm | null>(null)
  const [movementCustomerFilter, setMovementCustomerFilter] = useState('')
  const [productStockFilter, setProductStockFilter] = useState<ProductStockFilter>('todos')
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  const showToast = (kind: 'success' | 'error', message: string) => setToast({ kind, message })

  const loadData = async () => {
    if (!session) return
    setDataLoading(true)
    setDataError('')
    try {
      const result = await loadSupabaseInventory()
      setProducts(result.products)
      setMovements(result.movements)
      setCustomers(result.customers)
      setImportBatches(result.importBatches)
      setProductMappings(result.mappings)
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Não foi possível carregar os dados do Supabase.')
    } finally {
      setDataLoading(false)
    }
  }

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return
    }
    const client = supabase

    let mounted = true
    client.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setAuthLoading(false)
    }).catch(() => {
      if (mounted) setAuthLoading(false)
    })

    const { data: authListener } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthLoading(false)
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setProducts([])
      setMovements([])
      setCustomers([])
      setImportBatches([])
      setProductMappings([])
      setDataLoading(false)
      return
    }
    void loadData()
  }, [session])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const navigate = (nextView: View) => { setView(nextView); setMobileMenu(false) }
  const navigateToProducts = (stockFilter: ProductStockFilter = 'todos') => {
    setProductStockFilter(stockFilter)
    navigate('produtos')
  }

  const saveProduct = async (form: ProductForm, existing?: Product) => {
    const name = form.name.trim()
    const sku = form.sku.trim().toUpperCase()
    if (!name) { showToast('error', 'Informe o nome do produto.'); return false }
    if (sku && products.some((item) => item.sku && item.sku.toLowerCase() === sku.toLowerCase() && item.id !== existing?.id)) { showToast('error', 'Este SKU já está cadastrado.'); return false }
    const quantity = form.quantity.trim() === '' ? 0 : Number(form.quantity)
    const minStock = form.minStock.trim() === '' ? 0 : Number(form.minStock)
    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(minStock) || minStock < 0) { showToast('error', 'Quantidade e estoque mínimo devem ser válidos.'); return false }
    try {
      await saveSupabaseProduct({
        name, sku, imageUrl: form.imageUrl, category: form.category, description: form.description, unit: form.unit,
        quantity, minStock, location: form.location, active: form.active, stockKnown: form.quantity.trim() !== '',
      }, existing)
      await loadData()
      setProductModal({ open: false })
      showToast('success', existing ? 'Produto atualizado.' : 'Produto cadastrado.')
      return true
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Não foi possível salvar o produto.')
      return false
    }
  }

  const saveMovement = async (form: MovementForm) => {
    try {
      const value = Number(form.quantity)
      if (!form.productId) throw new InventoryError('Selecione um produto válido.')
      if (!Number.isFinite(value) || (form.type === 'ajuste' ? value < 0 : value <= 0)) throw new InventoryError('Informe uma quantidade válida.')
      if (!form.reason.trim()) throw new InventoryError('Informe o motivo da movimentação.')
      if (form.type === 'saida' && form.isSale && !customers.some((customer) => customer.id === form.customerId && customer.active)) throw new InventoryError('Selecione um cliente ativo para a venda.')
      await registerSupabaseMovement(form)
      await loadData()
      setMovementModal(false)
      setMovementDraft(null)
      showToast('success', form.isSale ? 'Venda registrada com sucesso.' : form.type === 'entrada' ? 'Entrada registrada com sucesso.' : form.type === 'saida' ? 'Saída registrada com sucesso.' : 'Ajuste registrado com sucesso.')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Não foi possível registrar a movimentação.')
    }
  }

  const saveCustomer = async (form: CustomerForm, existing?: Customer) => {
    if (!form.name.trim()) { showToast('error', 'Informe o nome do cliente.'); return false }
    try {
      const customerId = await saveSupabaseCustomer(form, existing)
      await loadData()
      setCustomerModal({ open: false })
      if (movementDraft) {
        setMovementDraft({ ...movementDraft, customerId: form.active ? customerId : '' })
        setMovementModal(true)
      }
      showToast('success', existing ? 'Cliente atualizado.' : 'Cliente cadastrado.')
      return true
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Não foi possível salvar o cliente.')
      return false
    }
  }

  const deleteCustomer = async (customer: Customer) => {
    if (!window.confirm(`Excluir o cliente "${customer.name}"? As movimentações vinculadas continuarão no histórico.`)) return
    try {
      await deleteSupabaseCustomer(customer.id)
      await loadData()
      if (movementCustomerFilter === customer.id) setMovementCustomerFilter('')
      setCustomerModal({ open: false })
      showToast('success', 'Cliente excluído. O histórico de movimentações foi preservado.')
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : 'Não foi possível excluir o cliente.')
    }
  }

  const resetData = async () => {
    if (!window.confirm('Recarregar os dados diretamente do Supabase?')) return
    await loadData()
    showToast('success', 'Dados recarregados do Supabase.')
  }

  if (!isSupabaseConfigured) return <SetupScreen />
  if (authLoading) return <StatusScreen title="Conectando ao Supabase" description="Verificando sua sessão segura..." />
  if (!session) return <LoginScreen onSignedIn={setSession} />
  if (dataLoading && products.length === 0) return <InventorySkeleton />
  if (dataError && products.length === 0) return <StatusScreen title="Não foi possível carregar os dados" description={dataError} action={<button className="button primary" onClick={() => void loadData()}>Tentar novamente</button>} />

  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <Sidebar activeView={view} productCount={products.length} onNavigate={(nextView) => nextView === 'produtos' ? navigateToProducts('todos') : navigate(nextView)} mobileOpen={mobileMenu} onClose={() => setMobileMenu(false)} onReset={resetData} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((current) => !current)} />
    <div className="app-main">
      <header className="topbar">
        <button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Abrir menu"><Menu size={21} /></button>
        <div className="breadcrumb"><span>Estoque Alternativa</span><span className="breadcrumb-separator">/</span><strong>{viewMeta[view].title}</strong></div>
        <div className="topbar-actions">{dataLoading && <span className="sync-indicator" role="status"><i /> Sincronizando</span>}<button className="user-chip" onClick={() => void supabase?.auth.signOut()} title="Sair" aria-label={`Sair da conta ${session.user.email ?? ''}`}><span className="avatar">{(session.user.email ?? 'U').slice(0, 2).toUpperCase()}</span><span className="user-name">{session.user.email ?? 'Usuário conectado'}</span></button></div>
      </header>
      <main key={view} className="page-content">
        <div className="page-heading"><div><p className="eyebrow">OPERAÇÃO DE ESTOQUE</p><h1>{viewMeta[view].title}</h1><p className="page-description">{viewMeta[view].description}</p></div><div className="heading-actions"><button className="button primary" onClick={() => view === 'clientes' ? setCustomerModal({ open: true }) : setMovementModal(true)}><Plus size={17} /> {view === 'clientes' ? 'Novo cliente' : 'Nova movimentação'}</button></div></div>
        {view === 'dashboard' && <Dashboard products={products} customers={customers} movements={movements} onNavigate={navigate} onViewProducts={navigateToProducts} />}
        {view === 'produtos' && <ProductsView products={products} stockFilter={productStockFilter} onStockFilterChange={setProductStockFilter} onNew={() => setProductModal({ open: true })} onEdit={(product) => setProductModal({ open: true, product })} />}
        {view === 'clientes' && <CustomersView customers={customers} movements={movements} onNew={() => setCustomerModal({ open: true })} onEdit={(customer) => setCustomerModal({ open: true, customer })} onViewSales={(customerId) => { setMovementCustomerFilter(customerId); navigate('movimentacoes') }} />}
        {view === 'movimentacoes' && <MovementsView products={products} customers={customers} movements={movements} customerFilter={movementCustomerFilter} onCustomerFilterChange={setMovementCustomerFilter} onNew={() => setMovementModal(true)} />}
        {view === 'importacoes' && <ImportationsView products={products} mappings={productMappings} batches={importBatches} onRefresh={loadData} onToast={showToast} />}
        {view === 'relatorios' && <ReportsView products={products} customers={customers} movements={movements} />}
      </main>
    </div>
    {productModal.open && <ProductModal product={productModal.product} onClose={() => setProductModal({ open: false })} onSave={saveProduct} />}
    {customerModal.open && <CustomerModal customer={customerModal.customer} onClose={() => { setCustomerModal({ open: false }); if (movementDraft) setMovementModal(true) }} onSave={saveCustomer} onDelete={deleteCustomer} />}
    {movementModal && <MovementModal products={products} customers={customers} initialForm={movementDraft} onClose={() => { setMovementModal(false); setMovementDraft(null) }} onSave={saveMovement} onCreateCustomer={(form) => { setMovementDraft(form); setMovementModal(false); setCustomerModal({ open: true }) }} />}
    {toast && <div className={`toast ${toast.kind}`}><span className="toast-icon">{toast.kind === 'success' ? <Check size={16} /> : <XCircle size={16} />}</span>{toast.message}<button onClick={() => setToast(null)} aria-label="Fechar aviso"><X size={15} /></button></div>}
  </div>
}

function SetupScreen() {
  return <StatusScreen
    title="Configure o Supabase"
    description="Crie um arquivo .env.local a partir do .env.example e preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY."
  />
}

function StatusScreen({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <main className="auth-shell"><section className="auth-card status-card"><div className="brand-wordmark"><strong>alternativa</strong><span>ESTOQUE</span></div><div className="status-mark"><ShieldCheck size={23} /></div><h1>{title}</h1><p>{description}</p>{action}</section></main>
}

function InventorySkeleton() {
  return <main className="skeleton-shell" aria-busy="true" aria-label="Carregando dados do estoque">
    <aside className="skeleton-sidebar"><div className="skeleton-brand" /><div className="skeleton-nav">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div></aside>
    <section className="skeleton-main"><div className="skeleton-topbar" /><div className="skeleton-content"><div className="skeleton-heading"><span /><strong /></div><div className="skeleton-metrics">{Array.from({ length: 4 }, (_, index) => <div key={index}><span /><strong /><i /></div>)}</div><div className="skeleton-panels"><div /><div /></div></div></section>
  </main>
}

function LoginScreen({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setLoading(true)
    setError('')
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (signInError || !data.session) {
      setError(signInError?.message ?? 'Não foi possível iniciar a sessão.')
      return
    }
    onSignedIn(data.session)
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <header className="login-header">
          <div className="login-brand">
            <div className="brand-wordmark"><strong>alternativa</strong><span>ESTOQUE</span></div>
            <span className="login-system-label">CONTROLE OPERACIONAL</span>
          </div>
          <span className="login-status"><span className="status-dot" /> Ambiente seguro</span>
        </header>

        <div className="login-content">
          <p className="login-kicker">ACESSO RESTRITO</p>
          <h1>Bem-vindo de volta</h1>
          <p className="login-description">Entre para acompanhar o estoque e manter sua operação em movimento.</p>
          <form onSubmit={signIn} className="login-form">
            <label className="login-field">
              <span>E-mail de acesso</span>
              <div className="login-input-wrap">
                <Mail size={17} />
                <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" />
              </div>
            </label>
            <label className="login-field">
              <span>Senha</span>
              <div className="login-input-wrap">
                <LockKeyhole size={17} />
                <input type={showPassword ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Digite sua senha" />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            <div className="login-form-meta">
              <span>Use seu usuário cadastrado</span>
              <span><ShieldCheck size={14} /> Acesso protegido</span>
            </div>
            <div className="login-feedback" aria-live="polite">{error && <p className="login-error"><XCircle size={15} />{error}</p>}</div>
            <button className="login-submit" type="submit" disabled={loading} aria-busy={loading}>
              <span>{loading ? 'Validando acesso...' : 'Entrar no estoque'}</span>
              {loading ? <span className="login-spinner" aria-hidden="true" /> : <ArrowRight size={17} />}
            </button>
          </form>
        </div>

        <p className="login-footer"><span>Alternativa Estoque</span><i /> Operação interna e segura</p>
      </section>

      <aside className="login-visual" aria-hidden="true">
        <div className="login-visual-glow login-visual-glow-one" />
        <div className="login-visual-glow login-visual-glow-two" />
        <div className="login-visual-media">
          <img className="login-dashboard-image" src={dashboardMockup} alt="" />
        </div>
        <div className="login-visual-copy">
          <p>UM ESTOQUE MAIS PRECISO</p>
          <h2>Decisões melhores começam com uma visão clara.</h2>
          <span>Acompanhe produtos, saldos e movimentações em um só lugar.</span>
        </div>
      </aside>
    </main>
  )
}

function Sidebar({ activeView, productCount, onNavigate, mobileOpen, onClose, onReset, collapsed, onToggle }: { activeView: View; productCount: number; onNavigate: (view: View) => void; mobileOpen: boolean; onClose: () => void; onReset: () => void; collapsed: boolean; onToggle: () => void }) {
  const items: { id: View; label: string; icon: typeof BarChart3 }[] = [
    { id: 'importacoes', label: 'Importar relatórios', icon: UploadCloud },
    { id: 'dashboard', label: 'Visão geral', icon: BarChart3 }, { id: 'produtos', label: 'Produtos', icon: Package }, { id: 'clientes', label: 'Clientes', icon: UsersRound }, { id: 'movimentacoes', label: 'Movimentações', icon: ClipboardList }, { id: 'relatorios', label: 'Relatórios', icon: ArrowDownToLine },
  ]
  return <><aside className={`sidebar ${mobileOpen ? 'open' : ''}`}><div className="brand"><div className="brand-wordmark"><strong>alternativa</strong><span>ESTOQUE</span></div><div className="sidebar-controls"><button className="sidebar-toggle" onClick={onToggle} aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'} title={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button><button className="sidebar-close" onClick={onClose} aria-label="Fechar menu"><X size={18} /></button></div></div><div className="workspace-label">CENTRAL DE OPERAÇÕES</div><nav>{items.map(({ id, label, icon: Icon }) => <button className={activeView === id ? 'active' : ''} key={id} onClick={() => onNavigate(id)} title={collapsed ? label : undefined}><Icon size={18} /><span>{label}</span>{id === 'produtos' && <span className="nav-count">{productCount}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="sidebar-status"><span><i className="status-dot" /><b>Supabase conectado</b></span><small>Dados sincronizados remotamente</small></div><button className="sidebar-reset" onClick={onReset} title={collapsed ? 'Recarregar dados' : undefined}><RotateCcw size={15} /><span>Recarregar dados</span></button></div></aside>{mobileOpen && <div className="sidebar-overlay" onClick={onClose} />}</>
}

function Dashboard({ products, customers, movements, onNavigate, onViewProducts }: { products: Product[]; customers: Customer[]; movements: Movement[]; onNavigate: (view: View) => void; onViewProducts: (filter?: ProductStockFilter) => void }) {
  const active = products.filter((product) => product.active)
  const tracked = active.filter((product) => product.stockKnown !== false)
  const lowStock = tracked.filter((product) => product.quantity > 0 && product.quantity <= product.minStock)
  const outOfStock = tracked.filter((product) => product.quantity === 0)
  const byUnit = stockByUnit(tracked)
  const totalQuantity = Object.values(byUnit).reduce((total, value) => total + value, 0)
  const hasStockData = tracked.length > 0
  return <div className="dashboard-grid">
    <section className="metrics-grid" aria-label="Resumo do estoque"><MetricCard icon={<Boxes />} label="Produtos cadastrados" value={formatNumber(active.length)} detail={`${products.filter((product) => !product.active).length} inativos`} tone="green" onClick={() => onViewProducts('todos')} /><MetricCard icon={<Package />} label="Itens em estoque" value={hasStockData ? formatNumber(totalQuantity) : '—'} detail={hasStockData ? Object.entries(byUnit).map(([unit, value]) => `${formatNumber(value)} ${unit}`).join('  ·  ') || 'Unidade não informada' : 'Nenhum saldo informado'} tone="blue" onClick={() => onViewProducts('disponivel')} /><MetricCard icon={<AlertTriangle />} label="Estoque baixo" value={hasStockData ? formatNumber(lowStock.length) : '—'} detail={hasStockData ? (lowStock.length ? 'Requer atenção' : 'Tudo dentro do mínimo') : 'Aguardando saldos'} tone="amber" onClick={() => onViewProducts('baixo')} /><MetricCard icon={<XCircle />} label="Sem estoque" value={hasStockData ? formatNumber(outOfStock.length) : '—'} detail={hasStockData ? (outOfStock.length ? 'Itens indisponíveis' : 'Nenhum item zerado') : 'Aguardando saldos'} tone="red" onClick={() => onViewProducts('zerado')} /></section>
    <section className="content-card quick-actions"><div className="section-heading"><div><p className="eyebrow">ATALHOS</p><h2>Ações rápidas</h2></div><span className="muted">Acesse o que precisa em poucos passos</span></div><div className="quick-action-list"><button onClick={() => onViewProducts('todos')}><span className="quick-icon purple"><Package size={20} /></span><span><strong>Consultar produtos</strong><small>Pesquise por nome, SKU ou categoria</small></span><ArrowRight size={17} /></button><button onClick={() => onNavigate('movimentacoes')}><span className="quick-icon green"><ArrowUpFromLine size={20} /></span><span><strong>Ver movimentações</strong><small>{movements.length ? `${movements.length} registros no histórico` : 'Nenhum registro ainda'}</small></span><ArrowRight size={17} /></button><button onClick={() => onNavigate('relatorios')}><span className="quick-icon orange"><BarChart3 size={20} /></span><span><strong>Gerar relatório</strong><small>Exporte dados em CSV</small></span><ArrowRight size={17} /></button></div></section>
    <section className="content-card recent-card"><div className="section-heading"><div><p className="eyebrow">ACOMPANHAMENTO</p><h2>Atividade recente</h2></div><button className="text-button" onClick={() => onNavigate('movimentacoes')}>Ver histórico <ArrowUpFromLine size={15} /></button></div>{movements.length === 0 ? <EmptyState compact title="Nenhuma movimentação registrada" description="As entradas e saídas aparecerão aqui." /> : <div className="activity-list">{movements.slice(0, 5).map((movement) => <ActivityRow key={movement.id} movement={movement} product={products.find((item) => item.id === movement.productId)} customer={customers.find((item) => item.id === movement.customerId)} />)}</div>}</section>
    <section className="content-card attention-card"><div className="section-heading"><div><p className="eyebrow">MONITORAMENTO</p><h2>Pontos de atenção</h2></div><span className="status-label">{tracked.length} saldos informados</span></div>{tracked.length === 0 ? <EmptyState compact title="Saldo ainda não informado" description="Cadastre saldos e estoque mínimo para ativar os alertas operacionais." /> : lowStock.length === 0 && outOfStock.length === 0 ? <EmptyState compact title="Estoque dentro do mínimo" description="Nenhum produto informado está abaixo do estoque mínimo." success /> : <div className="attention-list">{[...outOfStock, ...lowStock].slice(0, 5).map((product) => <button type="button" className="attention-row" key={product.id} onClick={() => onViewProducts(product.quantity === 0 ? 'zerado' : 'baixo')} aria-label={`Ver ${product.name} na lista de produtos`}><span className={`attention-icon ${product.quantity === 0 ? 'danger' : 'warning'}`}>{product.quantity === 0 ? <XCircle size={17} /> : <AlertTriangle size={17} />}</span><span className="attention-copy"><strong>{product.name}</strong><span>{product.quantity === 0 ? 'Sem estoque' : `Saldo ${quantityLabel(product.quantity, product.unit)} · mínimo ${quantityLabel(product.minStock, product.unit)}`}</span></span><span className={`pill ${product.quantity === 0 ? 'danger' : 'warning'}`}>{product.quantity === 0 ? 'Zerado' : 'Baixo'}</span><ArrowRight className="attention-arrow" size={15} /></button>)}</div>}</section>
  </div>
}

function MetricCard({ icon, label, value, detail, tone, onClick }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: string; onClick: () => void }) { return <button type="button" className="metric-card" onClick={onClick} aria-label={`${label}: ${value}. Abrir produtos filtrados`}><span className={`metric-icon ${tone}`}>{icon}</span><span className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></span><ArrowRight className="metric-arrow" size={15} /></button> }

function ActivityRow({ movement, product, customer }: { movement: Movement; product?: Product; customer?: Customer }) {
  const isIn = movement.type === 'entrada'
  const isOut = movement.type === 'saida'
  return <div className="activity-row">
    <div className={`activity-icon ${isIn ? 'in' : isOut ? 'out' : 'adjust'}`}>{isIn ? <ArrowDownToLine size={17} /> : isOut ? <ArrowUpFromLine size={17} /> : <SlidersHorizontal size={17} />}</div>
    <div className="activity-copy"><strong>{movement.isSale ? 'Venda' : isIn ? 'Entrada' : isOut ? 'Saída' : 'Ajuste'} <span>· {product?.name ?? 'Produto removido'}</span></strong><span>{movement.isSale ? `${customer?.name ?? movement.customerName ?? 'Cliente removido'} · ${movement.reason}` : movement.reason}</span></div>
    <div className="activity-value"><strong>{isOut ? '−' : '+'}{quantityLabel(movement.quantity, product?.unit ?? 'un')}</strong><span>{formatDateTime(movement.date)}</span></div>
  </div>
}

function ProductsView({ products, stockFilter, onStockFilterChange, onNew, onEdit }: { products: Product[]; stockFilter: ProductStockFilter; onStockFilterChange: (filter: ProductStockFilter) => void; onNew: () => void; onEdit: (product: Product) => void }) {
  const [query, setQuery] = useState(''); const [category, setCategory] = useState('todas'); const [status, setStatus] = useState('todos')
  const filtered = products.filter((product) => { const matchesQuery = `${product.name} ${product.sku}`.toLowerCase().includes(query.toLowerCase()); const matchesCategory = category === 'todas' || product.category === category; const matchesStatus = status === 'todos' || (status === 'ativo' ? product.active : !product.active); const known = product.stockKnown !== false; const matchesStock = stockFilter === 'todos' || (stockFilter === 'disponivel' && known && product.quantity > 0) || (stockFilter === 'baixo' && known && product.quantity > 0 && product.quantity <= product.minStock) || (stockFilter === 'zerado' && known && product.quantity === 0); return matchesQuery && matchesCategory && matchesStatus && matchesStock })
  return <section className="content-card page-card">
    <div className="card-toolbar"><div><p className="eyebrow">CATÁLOGO</p><h2>{products.length} produtos <span className="toolbar-muted">· {filtered.length} exibidos</span></h2></div><button className="button primary" onClick={onNew}><Plus size={17} /> Novo produto</button></div>
    <div className="filters"><label className="search-field"><Search size={17} /><input aria-label="Buscar produtos por nome ou código" placeholder="Buscar por nome ou código..." value={query} onChange={(event) => setQuery(event.target.value)} /></label><label className="select-field"><Filter size={16} /><select aria-label="Filtrar categoria" value={category} onChange={(event) => setCategory(event.target.value)}><option value="todas">Todas as categorias</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="select-field"><select aria-label="Filtrar status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="todos">Todos os status</option><option value="ativo">Ativos</option><option value="inativo">Inativos</option></select></label><label className="select-field"><select aria-label="Filtrar saldo" value={stockFilter} onChange={(event) => onStockFilterChange(event.target.value as ProductStockFilter)}><option value="todos">Todos os saldos</option><option value="disponivel">Com estoque</option><option value="baixo">Estoque baixo</option><option value="zerado">Sem estoque</option></select></label></div>
    {filtered.length === 0 ? <EmptyState title="Nenhum produto encontrado" description="Tente ajustar os filtros ou cadastre um novo produto." action={<button className="button secondary" onClick={onNew}><Plus size={16} /> Cadastrar produto</button>} /> : <div className="table-wrapper"><table><thead><tr><th>Produto</th><th>Código</th><th>Categoria</th><th>Saldo atual</th><th>Estoque mínimo</th><th>Localização</th><th>Status</th><th aria-label="Ações" /></tr></thead><tbody>{filtered.map((product) => { const stockKnown = product.stockKnown !== false; return <tr key={product.id}><td><div className="product-cell"><span className="product-thumb">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : product.category === 'Hidramax' ? <Truck size={17} /> : product.category === 'Suínos' ? <Sprout size={17} /> : <Package size={17} />}</span><span><strong>{product.name}</strong><small>{product.description || 'Descrição não informada no catálogo público'}</small></span></div></td><td><code className="product-code">{product.sku || '—'}</code></td><td><span className="category-tag">{product.category}</span></td><td><strong className={stockKnown && product.quantity === 0 ? 'text-danger' : stockKnown && product.quantity <= product.minStock ? 'text-warning' : ''}>{stockKnown ? quantityLabel(product.quantity, product.unit) : 'Não informado'}</strong></td><td>{stockKnown ? quantityLabel(product.minStock, product.unit) : 'Não informado'}</td><td>{product.location || 'Não informado'}</td><td><span className={`status-pill ${product.active ? 'active' : 'inactive'}`}><span /> {product.active ? 'Ativo' : 'Inativo'}</span></td><td><button className="row-action" onClick={() => onEdit(product)} aria-label={`Editar ${product.name}`}><Edit3 size={16} /></button></td></tr> })}</tbody></table></div>}
  </section>
}

function CustomersView({ customers, movements, onNew, onEdit, onViewSales }: {
  customers: Customer[]
  movements: Movement[]
  onNew: () => void
  onEdit: (customer: Customer) => void
  onViewSales: (customerId: string) => void
}) {
  const [query, setQuery] = useState('')
  const filtered = customers.filter((customer) =>
    `${customer.name} ${customer.document} ${customer.phone} ${customer.email}`.toLowerCase().includes(query.toLowerCase()),
  )

  return <section className="content-card page-card">
    <div className="card-toolbar">
      <div><p className="eyebrow">RELACIONAMENTO</p><h2>Clientes cadastrados <span className="toolbar-muted">· {customers.length} no total</span></h2></div>
      <button className="button primary" onClick={onNew}><Plus size={17} /> Cadastrar cliente</button>
    </div>
    <div className="filters">
      <label className="search-field"><Search size={17} /><input aria-label="Buscar clientes" placeholder="Buscar nome, documento ou contato..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    </div>
    {filtered.length === 0 ? <EmptyState title={customers.length ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'} description="Cadastre um cliente para vinculá-lo às vendas." action={<button className="button secondary" onClick={onNew}><Plus size={16} /> Cadastrar cliente</button>} /> :
      <div className="table-wrapper"><table className="clients-table"><thead><tr><th>Cliente</th><th>Documento</th><th>Contato</th><th>Vendas</th><th>Última venda</th><th>Status</th><th>Ações</th></tr></thead><tbody>
        {filtered.map((customer) => {
          const sales = movements.filter((movement) => movement.isSale && movement.customerId === customer.id)
          return <tr key={customer.id}>
            <td><strong>{customer.name}</strong></td>
            <td>{customer.document || '—'}</td>
            <td><strong>{customer.phone || '—'}</strong>{customer.email && <small className="table-subtext">{customer.email}</small>}</td>
            <td><strong>{sales.length}</strong></td>
            <td>{sales[0] ? formatDateTime(sales[0].date) : '—'}</td>
            <td><span className={`status-pill ${customer.active ? 'active' : 'inactive'}`}><span /> {customer.active ? 'Ativo' : 'Inativo'}</span></td>
            <td><div className="table-actions"><button className="text-button" onClick={() => onViewSales(customer.id)} disabled={sales.length === 0}>Ver vendas</button><button className="row-action" onClick={() => onEdit(customer)} aria-label={`Editar ${customer.name}`} title="Editar cliente"><Edit3 size={16} /></button></div></td>
          </tr>
        })}</tbody></table></div>}
  </section>
}

function MovementsView({ products, customers, movements, customerFilter, onCustomerFilterChange, onNew }: {
  products: Product[]
  customers: Customer[]
  movements: Movement[]
  customerFilter: string
  onCustomerFilterChange: (customerId: string) => void
  onNew: () => void
}) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('todos')
  const [selectedMovement, setSelectedMovement] = useState<{ movement: Movement; product?: Product; customer?: Customer } | null>(null)
  const filtered = movements.filter((movement) => {
    const product = products.find((item) => item.id === movement.productId)
    const customer = customers.find((item) => item.id === movement.customerId)
    const text = `${product?.name ?? ''} ${customer?.name ?? movement.customerName ?? ''} ${movement.reason} ${movement.reference ?? ''}`.toLowerCase()
    return text.includes(query.toLowerCase()) && (type === 'todos' || movement.type === type) && (!customerFilter || movement.customerId === customerFilter)
  })
  return <section className="content-card page-card">
    <div className="card-toolbar"><div><p className="eyebrow">AUDITORIA</p><h2>Histórico de movimentações <span className="toolbar-muted">· {filtered.length} registros</span></h2></div><button className="button primary" onClick={onNew}><Plus size={17} /> Registrar movimento</button></div>
    <div className="filters">
      <label className="search-field"><Search size={17} /><input aria-label="Buscar movimentações" placeholder="Buscar produto, cliente, motivo ou documento..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label className="select-field"><Filter size={16} /><select aria-label="Filtrar tipo" value={type} onChange={(event) => setType(event.target.value)}><option value="todos">Todos os tipos</option><option value="entrada">Entradas</option><option value="saida">Saídas</option><option value="ajuste">Ajustes</option></select></label>
      <label className="select-field"><UsersRound size={16} /><select aria-label="Filtrar cliente" value={customerFilter} onChange={(event) => onCustomerFilterChange(event.target.value)}><option value="">Todos os clientes</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
    </div>
    {filtered.length === 0 ? <EmptyState title="Nenhuma movimentação encontrada" description="Ajuste os filtros ou registre uma entrada, saída ou venda." action={<button className="button secondary" onClick={onNew}><Plus size={16} /> Registrar agora</button>} /> :
      <div className="table-wrapper"><table><thead><tr><th>Movimentação</th><th>Produto</th><th>Cliente</th><th>Quantidade</th><th>Saldo anterior</th><th>Saldo posterior</th><th>Data e responsável</th><th>Motivo</th></tr></thead><tbody>{filtered.map((movement) => {
        const product = products.find((item) => item.id === movement.productId)
        const customer = customers.find((item) => item.id === movement.customerId)
        const openDetails = () => setSelectedMovement({ movement, product, customer })
        return <tr
          key={movement.id}
          className="clickable-row"
          role="button"
          tabIndex={0}
          aria-label={`Ver detalhes da movimentação de ${product?.name ?? 'produto'}`}
          onClick={openDetails}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              openDetails()
            }
          }}
        >
          <td><span className={`movement-type ${movement.type}`}><span /> {movement.isSale ? 'Venda' : movement.type === 'entrada' ? 'Entrada' : movement.type === 'saida' ? 'Saída' : 'Ajuste'}</span></td>
          <td><strong>{product?.name ?? 'Produto removido'}</strong><small className="table-subtext">{product?.sku}</small></td>
          <td>{customer?.name ?? movement.customerName ?? (movement.isSale ? 'Cliente removido' : '—')}</td>
          <td><strong>{movement.type === 'saida' ? '−' : '+'}{quantityLabel(movement.quantity, product?.unit ?? 'un')}</strong></td>
          <td>{quantityLabel(movement.previousStock, product?.unit ?? 'un')}</td>
          <td>{quantityLabel(movement.nextStock, product?.unit ?? 'un')}</td>
          <td><strong>{formatDateTime(movement.date)}</strong><small className="table-subtext">{movement.user}</small></td>
          <td>{movement.reason}</td>
        </tr>
      })}</tbody></table></div>}
    {selectedMovement && <MovementDetailsModal {...selectedMovement} onClose={() => setSelectedMovement(null)} />}
  </section>
}

function MovementDetailsModal({ movement, product, customer, onClose }: {
  movement: Movement
  product?: Product
  customer?: Customer
  onClose: () => void
}) {
  const movementLabel = movement.isSale ? 'Venda' : movement.type === 'entrada' ? 'Entrada' : movement.type === 'saida' ? 'Saída' : 'Ajuste'
  const signedQuantity = `${movement.type === 'saida' ? '−' : '+'}${quantityLabel(movement.quantity, product?.unit ?? 'un')}`

  return <Modal title="Detalhes da movimentação" subtitle="Registro completo da operação no estoque." onClose={onClose}>
    <div className="movement-detail">
      <div className={`movement-detail-hero ${movement.type}`}>
        <span className={`movement-type ${movement.type}`}><span /> {movementLabel}</span>
        <strong>{signedQuantity}</strong>
        <small>{formatDateTime(movement.date)}</small>
      </div>
      <div className="movement-detail-grid">
        <div><span>Produto</span><strong>{product?.name ?? 'Produto removido'}</strong>{product?.sku && <small>SKU: {product.sku}</small>}</div>
        <div><span>Cliente</span><strong>{movement.isSale ? (customer?.name ?? movement.customerName ?? 'Cliente removido') : 'Não se aplica'}</strong>{movement.isSale && customer?.document && <small>{customer.document}</small>}{movement.isSale && customer?.phone && <small>{customer.phone}</small>}</div>
        <div><span>Saldo anterior</span><strong>{quantityLabel(movement.previousStock, product?.unit ?? 'un')}</strong></div>
        <div><span>Saldo posterior</span><strong>{quantityLabel(movement.nextStock, product?.unit ?? 'un')}</strong></div>
        <div><span>Responsável</span><strong>{movement.user}</strong></div>
        <div><span>Data e hora</span><strong>{formatDateTime(movement.date)}</strong></div>
        <div><span>Motivo</span><strong>{movement.reason || 'Não informado'}</strong></div>
        <div><span>Destino / fornecedor</span><strong>{movement.destination || 'Não informado'}</strong></div>
        <div><span>Documento de referência</span><strong>{movement.reference || 'Não informado'}</strong></div>
        <div className="movement-detail-wide"><span>Observações</span><p>{movement.notes || 'Nenhuma observação registrada.'}</p></div>
        <div className="movement-detail-wide"><span>ID do registro</span><code>{movement.id}</code></div>
      </div>
    </div>
  </Modal>
}

function ImportationsView({ products, mappings, batches, onRefresh, onToast }: {
  products: Product[]
  mappings: ProductExternalMapping[]
  batches: ImportBatch[]
  onRefresh: () => Promise<void>
  onToast: (kind: 'success' | 'error', message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [sourceFiles, setSourceFiles] = useState<File[]>([])
  const sourceFile = sourceFiles[0] ?? null
  const [fileFormat, setFileFormat] = useState<ImportBatch['fileFormat']>('csv')
  const [result, setResult] = useState<ImportParseResult | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [batchId, setBatchId] = useState('')
  const [referenceStart, setReferenceStart] = useState('')
  const [referenceEnd, setReferenceEnd] = useState('')
  const [filter, setFilter] = useState<ImportFilter>('all')
  const [stage, setStage] = useState<'idle' | 'reading' | 'ready' | 'saving' | 'confirming'>('idle')
  const [error, setError] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [rulesText, setRulesText] = useState(DEFAULT_OPERATION_RULES.map((rule) => `${rule.type}|${rule.label}|${rule.aliases.join(', ')}`).join('\n'))

  const rules = (): OperationRule[] => rulesText.split('\n').map((line) => {
    const [type, label, aliases] = line.split('|')
    return { type: type?.trim() as MovementType | 'ignorar', label: label?.trim() || type?.trim() || 'Regra', aliases: (aliases || '').split(',').map((item) => item.trim()).filter(Boolean) }
  }).filter((rule) => ['entrada', 'saida', 'ajuste', 'ignorar'].includes(rule.type) && rule.aliases.length)

  const summarize = (items: ImportRow[]) => ({
    total: items.length,
    valid: items.filter((row) => row.status === 'valid').length,
    entries: items.filter((row) => row.status === 'valid' && row.type === 'entrada').length,
    exits: items.filter((row) => row.status === 'valid' && row.type === 'saida').length,
    ignored: items.filter((row) => row.status === 'ignored').length,
    duplicates: items.filter((row) => row.status === 'duplicate').length,
    pending: items.filter((row) => row.status === 'pending' && !row.errors.some((item) => /quantidade|data/i.test(item))).length,
    invalid: items.filter((row) => row.status === 'error' || row.errors.length > 0).length,
  })

  const processFiles = async (files: File[]) => {
    setStage('reading'); setError(''); setBatchId(''); setSourceFiles(files); setFileName(files.length === 1 ? files[0].name : `${files.length} arquivos selecionados`)
    try {
      const loaded = await readUniversalFiles(files)
      setFileFormat(loaded.format)
      const parsed = parseReportRows(loaded.rows, products, mappings, rules(), loaded.fingerprint)
      const projectedRows = calculateImportProjection(parsed.rows, products)
      const parserWarnings = loaded.format === 'pdf' ? parsed.warnings.filter((warning) => !/coluna de quantidade|coluna de opera[cç][aã]o/i.test(warning)) : parsed.warnings
      setResult({ ...parsed, rows: projectedRows, warnings: [...new Set([...loaded.warnings, ...parserWarnings])], documentErrors: loaded.documents.flatMap((document) => document.errors), sourceDocuments: loaded.documents, detectedFormat: loaded.format }); setRows(projectedRows); setStage('ready')
    } catch (cause) {
      setStage('idle'); setError(cause instanceof Error ? cause.message : 'Não foi possível ler o relatório.')
    }
  }

  const processFile = async (file: File) => processFiles([file])

  const updateRow = (rowNumber: number, update: Partial<ImportRow>) => {
    setRows((current) => calculateImportProjection(current.map((row) => {
      if (row.rowNumber !== rowNumber) return row
      const next = { ...row, ...update }
      const isTypeChange = Object.keys(update).every((key) => ['type', 'status', 'errors'].includes(key))
      if (isTypeChange) {
        const errors = row.errors.filter((item) => !/tipo de opera[cç][aã]o pendente|pedido de venda.*pendente/i.test(item))
        if (!update.type) errors.push('Tipo de operação pendente de classificação.')
        next.manualClassification = Boolean(update.type)
        next.errors = errors
        next.status = next.productId && next.quantity && next.date && errors.length === 0 ? 'valid' : 'pending'
      }
      return next
    }), products))
  }

  const savePreview = async () => {
    if (!rows.length) return
    setStage('saving'); setError('')
    try {
      const id = batchId || await createSupabaseImportBatch({ fileName, fileFormat, referenceStart, referenceEnd, rows, warnings: result?.warnings ?? [], fileCount: sourceFiles.length, detectedFormats: [...new Set(result?.sourceDocuments?.map((document) => document.format) ?? [fileFormat])] })
      setBatchId(id)
      if (batchId) await updateSupabaseImportRows(id, rows)
      onToast('success', 'Prévia salva. O estoque ainda não foi alterado.')
      setStage('ready')
      await onRefresh()
    } catch (cause) {
      setStage('ready'); setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a prévia.')
    }
  }

  const confirm = async () => {
    const summary = summarize(rows)
    if (result?.documentErrors?.length) { onToast('error', 'Remova ou corrija os documentos que não puderam ser lidos antes de confirmar.'); return }
    if (summary.pending || summary.invalid) { onToast('error', 'Resolva todos os registros pendentes antes de confirmar.'); return }
    if (!window.confirm('Confirmar este lote? As movimentações válidas serão aplicadas em uma única transação.')) return
    setStage('confirming'); setError('')
    try {
      const id = batchId || await createSupabaseImportBatch({ fileName, fileFormat, referenceStart, referenceEnd, rows, warnings: result?.warnings ?? [], fileCount: sourceFiles.length, detectedFormats: [...new Set(result?.sourceDocuments?.map((document) => document.format) ?? [fileFormat])] })
      setBatchId(id)
      await updateSupabaseImportRows(id, rows)
      const confirmation = await confirmSupabaseImportBatch(id)
      onToast('success', `${confirmation?.imported_count ?? 0} operações importadas. ${confirmation?.duplicate_count ?? 0} duplicidades e ${confirmation?.ignored_count ?? 0} registros não-estoque ignorados.`)
      setRows([]); setResult(null); setBatchId(''); setFileName(''); setStage('idle'); await onRefresh()
    } catch (cause) {
      setStage('ready'); setError(cause instanceof Error ? cause.message : 'Falha na confirmação. Nenhuma alteração parcial foi mantida.')
    }
  }

  const chooseProduct = async (row: ImportRow, productId: string) => {
    const product = products.find((item) => item.id === productId)
    if (!product) return
    const errors = row.errors.filter((item) => !item.toLowerCase().includes('produto') && !item.toLowerCase().includes('unidade de medida'))
    const next = { ...row, productId, productMatch: 'mapping' as const, status: errors.length ? 'pending' as const : 'valid' as const, errors }
    updateRow(row.rowNumber, next)
    const identifier = row.externalCode || row.barcode || row.productName
    const identifierType = row.externalCode ? 'external_code' : row.barcode ? 'barcode' : 'name'
    if (identifier) {
      try { await saveSupabaseExternalMapping({ externalSystem: 'relatorio', identifierType, externalIdentifier: identifier, productId }) } catch (cause) { onToast('error', cause instanceof Error ? cause.message : 'Não foi possível salvar o vínculo.') }
    }
  }

  const visibleRows = rows.filter((row) => filter === 'all' || filter === 'valid' && row.status === 'valid' || filter === 'entrada' && row.type === 'entrada' || filter === 'saida' && row.type === 'saida' || filter === 'duplicate' && row.status === 'duplicate' || filter === 'unmatched' && !row.productId || filter === 'error' && row.errors.length > 0)
  const summary = summarize(rows)
  const previewLabel = fileFormat === 'pdf' ? `${result?.sourceDocuments?.find((document) => document.format === 'pdf')?.documentLabel ?? 'PDF textual'} · ${rows.length} registros extraídos` : `${fileFormat.toUpperCase()} · ${result?.headers.length ?? 0} colunas reconhecidas`

  return <div className="imports-page">
    <section className="content-card import-hero">
      <div><p className="eyebrow">INGESTÃO CONTROLADA</p><h2>Importe operações do seu relatório</h2><p className="muted">O arquivo é lido e validado antes de qualquer alteração. Produtos ambíguos e operações sem regra ficam pendentes para revisão.</p></div>
      <input ref={inputRef} type="file" multiple accept=".xml,.zip,.pdf,.csv,.xls,.xlsx,.txt,.json" hidden onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) void processFiles(files); event.currentTarget.value = '' }} />
      <button className="import-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const files = Array.from(event.dataTransfer.files); if (files.length) void processFiles(files) }}><UploadCloud size={23} /><strong>{fileName || 'Selecione ou arraste um relatório'}</strong><span>XML, ZIP, PDF, CSV, Excel, TXT ou JSON · até 50 arquivos por lote</span></button>
    </section>
    {error && <div className="import-alert error"><XCircle size={17} />{error}</div>}
    {stage === 'reading' && <div className="import-progress"><span className="loading-dot" /> Lendo cabeçalhos, produtos e operações...</div>}
    {result && <>
      <div className="import-preview-label">{previewLabel}</div>
      <section className="content-card import-ignored-summary"><p className="eyebrow">SEM MOVIMENTAÇAO DE ESTOQUE</p><strong>{summary.ignored} registros serão ignorados</strong><span className="muted">Cancelamentos, estornos ou registros financeiros permanecem no lote para auditoria.</span></section>
      {result.warnings.length > 0 && <div className="import-alert"><AlertTriangle size={17} />{result.warnings.join(' ')}</div>}
      <section className="import-toolbar content-card">
        <div className="import-toolbar-heading"><div><p className="eyebrow">PRÉVIA DO LOTE</p><h2>{fileName}</h2><span>{fileFormat.toUpperCase()} · {result.headers.length} colunas reconhecidas</span></div><div className="import-actions"><button className="button secondary" onClick={() => setHistoryOpen((current) => !current)}><History size={16} /> Histórico</button><button className="button secondary" onClick={() => void savePreview()} disabled={stage === 'saving' || stage === 'confirming'}><Save size={16} /> {stage === 'saving' ? 'Salvando...' : 'Salvar prévia'}</button><button className="button primary" onClick={() => void confirm()} disabled={stage === 'saving' || stage === 'confirming' || summary.pending > 0 || summary.invalid > 0 || Boolean(result.documentErrors?.length)}><Check size={16} /> {stage === 'confirming' ? 'Confirmando...' : 'Confirmar importação'}</button></div></div>
        <div className="import-period"><label>Início do período<input type="date" value={referenceStart} onChange={(event) => setReferenceStart(event.target.value)} /></label><label>Fim do período<input type="date" value={referenceEnd} onChange={(event) => setReferenceEnd(event.target.value)} /></label><span className="import-state"><span className={`status-dot ${batchId ? 'ready' : ''}`} />{batchId ? 'Prévia registrada no histórico' : 'Ainda não persistida'}</span></div>
      </section>
      <section className="import-metrics">{[['Linhas lidas', summary.total, 'neutral'], ['Operações válidas', summary.valid, 'green'], ['Entradas', summary.entries, 'green'], ['Saídas', summary.exits, 'blue'], ['Pendentes', summary.pending, 'amber'], ['Inválidas', summary.invalid, 'red']].map(([label, value, tone]) => <div className={`import-metric ${tone}`} key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</section>
      <section className="content-card import-config"><div><p className="eyebrow">MAPEAMENTO CONFIGURÁVEL</p><h3>Regras de operação</h3><p className="muted">Uma regra por linha: tipo|nome|texto do relatório separado por vírgula. Linhas sem correspondência continuam pendentes.</p></div><textarea value={rulesText} onChange={(event) => setRulesText(event.target.value)} rows={4} /><button className="button secondary" onClick={() => { if (sourceFile) void processFile(sourceFile) }}><FileSpreadsheet size={15} /> Reprocessar regras</button></section>
      <section className="content-card import-table-card"><div className="card-toolbar"><div><p className="eyebrow">REVISÃO HUMANA</p><h2>{visibleRows.length} registros exibidos</h2></div><div className="import-filters">{([['all', 'Todos'], ['valid', 'Válidos'], ['entrada', 'Entradas'], ['saida', 'Saídas'], ['unmatched', 'Sem produto'], ['error', 'Com erros']] as [ImportFilter, string][]).map(([value, label]) => <button className={filter === value ? 'active' : ''} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div></div><div className="table-wrapper"><table className="import-table"><thead><tr><th>Linha / data</th><th>Documento</th><th>Produto do relatório</th><th>Produto cadastrado</th><th>Operação</th><th>Quantidade</th><th>Saldo projetado</th><th>Situação</th></tr></thead><tbody>{visibleRows.map((row) => <ImportRowView key={row.rowNumber} row={row} products={products} onProductChange={(id) => void chooseProduct(row, id)} onTypeChange={(type) => updateRow(row.rowNumber, { type, status: row.productId && row.quantity && row.date ? 'valid' : 'pending', errors: row.errors.filter((item) => !item.includes('Tipo de operação')) })} />)}</tbody></table></div></section>
    </>}
    {!result && <section className="content-card import-empty"><FileSpreadsheet size={26} /><h3>Nenhum relatório selecionado</h3><p>Comece com um arquivo exportado pelo sistema interno. O formato do cabeçalho será detectado automaticamente.</p></section>}
    {historyOpen && <section className="content-card import-history"><div className="section-heading"><div><p className="eyebrow">RASTREABILIDADE</p><h2>Histórico de lotes</h2></div><button className="icon-button" onClick={() => setHistoryOpen(false)} aria-label="Fechar histórico"><X size={18} /></button></div>{batches.length === 0 ? <EmptyState compact title="Nenhum lote processado" description="As prévias e confirmações aparecerão aqui." /> : <div className="batch-list">{batches.map((batch) => <div className="batch-row" key={batch.id}><span className="batch-icon"><History size={17} /></span><div><strong>{batch.fileName}</strong><small>{formatDateTime(batch.processedAt)} · {batch.totalRows} linhas · {batch.importedRows} importadas · {batch.duplicateRows} duplicadas</small></div><span className={`batch-status ${batch.status}`}>{batch.status === 'confirmed' ? 'Confirmado' : batch.status === 'review' ? 'Em revisão' : batch.status}</span></div>)}</div>}</section>}
  </div>
}

function ImportRowView({ row, products, onProductChange, onTypeChange }: { row: ImportRow; products: Product[]; onProductChange: (id: string) => void; onTypeChange: (type: MovementType | null) => void }) {
  const product = products.find((item) => item.id === row.productId)
  const status = row.errors.length ? 'Pendente' : row.status === 'valid' ? 'Válido' : row.status === 'duplicate' ? 'Duplicado' : 'Pendente'
  return <tr className={row.errors.length ? 'import-row-warning' : ''}><td><strong>#{row.rowNumber}</strong><small>{row.date ? formatDateTime(row.date) : 'Data ausente'}</small></td><td>{row.document || '—'}</td><td><strong>{row.productText || 'Produto ausente'}</strong><small>{row.externalCode || row.barcode || 'Sem identificador'}</small></td><td><select value={row.productId} onChange={(event) => onProductChange(event.target.value)}><option value="">Selecionar produto</option>{products.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}{item.sku ? ` · ${item.sku}` : ''}</option>)}</select>{row.productMatch === 'suggestion' && <small className="table-subtext">Sugestão para revisão</small>}</td><td><select value={row.type ?? ''} onChange={(event) => onTypeChange((event.target.value || null) as MovementType | null)}><option value="">Pendente</option><option value="entrada">Entrada</option><option value="saida">Saída</option><option value="ajuste">Ajuste</option></select><small className="table-subtext">{row.operationText || 'Sem tipo no arquivo'}</small></td><td><strong>{row.quantity ?? '—'}</strong>{row.unit && <small>{row.unit}</small>}</td><td>{row.projectedStock === undefined ? '—' : quantityLabel(row.projectedStock, product?.unit ?? row.unit ?? 'un')}</td><td><span className={`import-status ${row.errors.length ? 'warning' : 'success'}`}><span />{status}</span>{row.errors.slice(0, 2).map((item) => <small className="import-error" key={item}>{item}</small>)}</td></tr>
}

function ReportsView({ products, customers, movements }: { products: Product[]; customers: Customer[]; movements: Movement[] }) {
  const [report, setReport] = useState<'saldo' | 'baixo' | 'movimentos'>('saldo')
  const rows = report === 'saldo' ? products : report === 'baixo' ? products.filter((product) => product.stockKnown !== false && product.quantity <= product.minStock) : movements
  const exportCsv = () => { const header = report === 'movimentos' ? ['Tipo', 'Produto', 'Cliente', 'Quantidade', 'Saldo anterior', 'Saldo posterior', 'Data', 'Motivo'] : ['Produto', 'SKU', 'Categoria', 'Saldo', 'Unidade', 'Mínimo', 'Localização']; const body = report === 'movimentos' ? movements.map((item) => { const product = products.find((productItem) => productItem.id === item.productId); return [item.isSale ? 'Venda' : item.type, product?.name, customers.find((customer) => customer.id === item.customerId)?.name ?? item.customerName ?? '', item.quantity, item.previousStock, item.nextStock, item.date, item.reason].map(csvCell).join(';') }) : (rows as Product[]).map((item) => [item.name, item.sku, item.category, item.stockKnown === false ? '' : item.quantity, item.unit, item.stockKnown === false ? '' : item.minStock, item.location].map(csvCell).join(';')); const blob = new Blob([[header.map(csvCell).join(';'), ...body].join('\n')], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `relatorio-${report}-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url) }
  return <div className="reports-layout"><section className="content-card report-selector"><p className="eyebrow">CENTRAL DE DADOS</p><h2>Escolha um relatório</h2><p className="muted">Consulte saldos e operações sem perder o contexto.</p><div className="report-options"><button className={report === 'saldo' ? 'selected' : ''} onClick={() => setReport('saldo')}><span className="report-icon green"><Boxes size={19} /></span><span><strong>Saldo atual</strong><small>Todos os produtos e localizações</small></span>{report === 'saldo' && <Check size={17} />}</button><button className={report === 'baixo' ? 'selected' : ''} onClick={() => setReport('baixo')}><span className="report-icon amber"><AlertTriangle size={19} /></span><span><strong>Abaixo do mínimo</strong><small>Itens que exigem reposição</small></span>{report === 'baixo' && <Check size={17} />}</button><button className={report === 'movimentos' ? 'selected' : ''} onClick={() => setReport('movimentos')}><span className="report-icon blue"><ClipboardList size={19} /></span><span><strong>Movimentações</strong><small>Histórico completo de operações</small></span>{report === 'movimentos' && <Check size={17} />}</button></div><button className="button secondary export-button" onClick={exportCsv}><Download size={16} /> Exportar CSV</button></section><section className="content-card report-preview"><div className="section-heading"><div><p className="eyebrow">PRÉVIA</p><h2>{report === 'saldo' ? 'Saldo atual' : report === 'baixo' ? 'Abaixo do mínimo' : 'Movimentações'}</h2></div><span className="report-count">{rows.length} registros</span></div>{rows.length === 0 ? <EmptyState compact title="Nenhum dado para exibir" description="Quando houver dados compatíveis, eles aparecerão nesta prévia." /> : report === 'movimentos' ? <div className="mini-report-list">{(rows as Movement[]).slice(0, 7).map((movement) => <ActivityRow key={movement.id} movement={movement} product={products.find((item) => item.id === movement.productId)} customer={customers.find((item) => item.id === movement.customerId)} />)}</div> : <div className="mini-report-list">{(rows as Product[]).slice(0, 7).map((product) => <div className="report-product-row" key={product.id}><div><strong>{product.name}</strong><span>{product.category} · {product.location || 'Localização não informada'}</span></div><strong className={product.stockKnown !== false && product.quantity <= product.minStock ? 'text-warning' : ''}>{product.stockKnown === false ? 'Não informado' : quantityLabel(product.quantity, product.unit)}</strong></div>)}</div>}</section></div>
}

function EmptyState({ title, description, action, compact, success }: { title: string; description: string; action?: React.ReactNode; compact?: boolean; success?: boolean }) { return <div className={`empty-state ${compact ? 'compact' : ''}`}><div className={`empty-icon ${success ? 'success' : ''}`}>{success ? <Check size={21} /> : <Package size={21} />}</div><strong>{title}</strong><span>{description}</span>{action}</div> }

function ProductModal({ product, onClose, onSave }: { product?: Product; onClose: () => void; onSave: (form: ProductForm, existing?: Product) => Promise<boolean> }) {
  const [form, setForm] = useState<ProductForm>(product ? { name: product.name, sku: product.sku, imageUrl: product.imageUrl, category: product.category, description: product.description, unit: product.unit, quantity: product.stockKnown === false ? '' : String(product.quantity), minStock: product.stockKnown === false ? '' : String(product.minStock), location: product.location, active: product.active } : emptyProductForm)
  const update = (field: keyof ProductForm, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }))
  return <Modal title={product ? 'Editar produto' : 'Novo produto'} subtitle="Cadastre as informações usadas na operação." onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); onSave(form, product) }}><div className="form-grid"><Field label="Nome do produto" required><input autoFocus value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Ex.: Protecocho 200" /></Field><Field label="SKU / código interno"><input value={form.sku} onChange={(event) => update('sku', event.target.value)} placeholder="Não informado" /></Field><Field label="Categoria"><select value={form.category} onChange={(event) => update('category', event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Unidade de medida"><select value={form.unit} onChange={(event) => update('unit', event.target.value)}><option value="">Não informado</option>{units.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Saldo inicial"><input type="number" min="0" step="0.01" value={form.quantity} onChange={(event) => update('quantity', event.target.value)} /></Field><Field label="Estoque mínimo"><input type="number" min="0" step="0.01" value={form.minStock} onChange={(event) => update('minStock', event.target.value)} /></Field><Field label="Localização no depósito"><input value={form.location} onChange={(event) => update('location', event.target.value)} placeholder="Não informado" /></Field><Field label="Status"><label className="switch-field"><input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} /><span className="switch" /> Produto ativo</label></Field><Field label="Descrição" wide><textarea rows={3} value={form.description} onChange={(event) => update('description', event.target.value)} placeholder="Descrição oficial do produto..." /></Field></div><div className="modal-footer"><span className="form-note"><ShieldCheck size={14} /> Sem SKU oficial preenchido</span><div><button type="button" className="button ghost" onClick={onClose}>Cancelar</button><button type="submit" className="button primary">{product ? 'Salvar alterações' : 'Cadastrar produto'}</button></div></div></form></Modal>
}

function CustomerModal({ customer, onClose, onSave, onDelete }: {
  customer?: Customer
  onClose: () => void
  onSave: (form: CustomerForm, existing?: Customer) => Promise<boolean>
  onDelete?: (customer: Customer) => Promise<void>
}) {
  const [form, setForm] = useState<CustomerForm>(customer ? {
    name: customer.name, document: customer.document, phone: customer.phone,
    email: customer.email, notes: customer.notes, active: customer.active,
  } : emptyCustomerForm)
  const [saving, setSaving] = useState(false)
  const update = (field: keyof CustomerForm, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try { await onSave(form, customer) } finally { setSaving(false) }
  }
  return <Modal title={customer ? 'Editar cliente' : 'Novo cliente'} subtitle="Dados para identificar o cliente e acompanhar suas vendas." onClose={onClose}>
    <form onSubmit={submit}>
      <div className="form-grid">
        <Field label="Nome do cliente" required wide><input autoFocus required maxLength={180} value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="Nome ou razão social" /></Field>
        <Field label="CPF / CNPJ"><input maxLength={24} value={form.document} onChange={(event) => update('document', event.target.value)} placeholder="Opcional" /></Field>
        <Field label="Telefone"><input type="tel" maxLength={30} value={form.phone} onChange={(event) => update('phone', event.target.value)} placeholder="Opcional" /></Field>
        <Field label="E-mail"><input type="email" maxLength={180} value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="Opcional" /></Field>
        <Field label="Status"><label className="switch-field"><input type="checkbox" checked={form.active} onChange={(event) => update('active', event.target.checked)} /><span className="switch" /> Cliente ativo</label></Field>
        <Field label="Observações" wide><textarea rows={3} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Informações úteis sobre o cliente" /></Field>
      </div>
      <div className="modal-footer"><span className="form-note"><ShieldCheck size={14} /> Os dados são salvos no Supabase</span><div>{customer && onDelete && <button type="button" className="button danger-outline" onClick={() => void onDelete(customer)} disabled={saving}><Trash2 size={15} /> Excluir cliente</button>}<button type="button" className="button ghost" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="button primary" disabled={saving}>{saving ? 'Salvando...' : customer ? 'Salvar alterações' : 'Cadastrar cliente'}</button></div></div>
    </form>
  </Modal>
}

function MovementModal({ products, customers, initialForm, onClose, onSave, onCreateCustomer }: {
  products: Product[]
  customers: Customer[]
  initialForm: MovementForm | null
  onClose: () => void
  onSave: (form: MovementForm) => Promise<void>
  onCreateCustomer: (form: MovementForm) => void
}) {
  const [form, setForm] = useState<MovementForm>(initialForm ?? { ...emptyMovementForm, productId: products.find((item) => item.active)?.id ?? '' })
  const [saving, setSaving] = useState(false)
  const product = products.find((item) => item.id === form.productId)
  const activeCustomers = customers.filter((customer) => customer.active)
  const update = (field: keyof MovementForm, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }))
  const changeType = (type: MovementForm['type']) => setForm((current) => ({ ...current, type, isSale: type === 'saida', customerId: '', reason: type === 'saida' ? 'Venda' : '' }))
  const changeSale = (isSale: boolean) => setForm((current) => ({
    ...current, isSale, customerId: '', reason: isSale ? (current.reason || 'Venda') : current.reason === 'Venda' ? '' : current.reason,
  }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return <Modal title="Nova movimentação" subtitle="Atualize o saldo e mantenha a rastreabilidade da operação." onClose={onClose}>
    <form onSubmit={submit}>
      <div className="movement-tabs">{(['entrada', 'saida', 'ajuste'] as const).map((type) =>
        <button type="button" className={form.type === type ? `selected ${type}` : ''} onClick={() => changeType(type)} key={type}>
          {type === 'entrada' ? <ArrowDownToLine size={17} /> : type === 'saida' ? <ArrowUpFromLine size={17} /> : <SlidersHorizontal size={17} />}
          {type === 'entrada' ? 'Entrada' : type === 'saida' ? 'Saída' : 'Ajuste'}
        </button>,
      )}</div>
      {form.type === 'saida' && <div className="sale-section">
        <span className="sale-label">Natureza da saída</span>
        <div className="sale-choice">
          <button type="button" className={form.isSale ? 'selected' : ''} onClick={() => changeSale(true)}>Venda para cliente</button>
          <button type="button" className={!form.isSale ? 'selected' : ''} onClick={() => changeSale(false)}>Outra saída</button>
        </div>
        {form.isSale && <div className="sale-customer">
          <Field label="Cliente da venda" required wide>
            <select required value={form.customerId} onChange={(event) => update('customerId', event.target.value)}>
              <option value="">Selecione um cliente</option>
              {activeCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.document ? ` · ${customer.document}` : ''}</option>)}
            </select>
          </Field>
          <button type="button" className="text-button" onClick={() => onCreateCustomer(form)}><Plus size={15} /> Cadastrar cliente</button>
        </div>}
      </div>}
      <div className="form-grid">
        <Field label="Produto" required wide><select required value={form.productId} onChange={(event) => update('productId', event.target.value)}>{products.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · saldo {item.stockKnown === false ? 'não informado' : quantityLabel(item.quantity, item.unit)}</option>)}</select></Field>
        <Field label={form.type === 'ajuste' ? 'Quantidade contada' : 'Quantidade'} required><input autoFocus required type="number" min={form.type === 'ajuste' ? '0' : '0.01'} step="0.01" value={form.quantity} onChange={(event) => update('quantity', event.target.value)} placeholder="0" /></Field>
        <Field label="Motivo" required><input required value={form.reason} onChange={(event) => update('reason', event.target.value)} placeholder={form.isSale ? 'Venda' : form.type === 'entrada' ? 'Ex.: Recebimento' : form.type === 'saida' ? 'Ex.: Expedição' : 'Ex.: Contagem física'} /></Field>
        <Field label="Documento de referência"><input value={form.reference} onChange={(event) => update('reference', event.target.value)} placeholder="NF, pedido ou OS" /></Field>
        <Field label="Fornecedor / destino"><input value={form.destination} onChange={(event) => update('destination', event.target.value)} placeholder={form.type === 'entrada' ? 'Fornecedor' : 'Setor ou destino'} /></Field>
        <Field label="Observação" wide><textarea rows={3} value={form.notes} onChange={(event) => update('notes', event.target.value)} placeholder="Informações adicionais..." /></Field>
      </div>
      {product && <div className="balance-preview"><div><span>Saldo atual</span><strong>{product.stockKnown === false ? 'Não informado' : quantityLabel(product.quantity, product.unit)}</strong></div><div className="balance-arrow">→</div><div><span>Após operação</span><strong className={form.type === 'saida' ? 'text-warning' : 'text-green'}>{form.quantity && Number.isFinite(Number(form.quantity)) ? quantityLabel(form.type === 'entrada' ? product.quantity + Number(form.quantity) : form.type === 'saida' ? Math.max(0, product.quantity - Number(form.quantity)) : Number(form.quantity), product.unit) : '—'}</strong></div></div>}
      <div className="modal-footer"><span className="form-note"><ShieldCheck size={14} /> Operação auditável</span><div><button type="button" className="button ghost" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="button primary" disabled={saving}>{saving ? 'Registrando...' : form.isSale ? 'Confirmar venda' : `Confirmar ${form.type === 'entrada' ? 'entrada' : form.type === 'saida' ? 'saída' : 'ajuste'}`}</button></div></div>
    </form>
  </Modal>
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)

  const requestClose = () => {
    if (closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(onClose, 190)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') requestClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    }
  }, [])

  return createPortal(
    <div className={`modal-backdrop ${closing ? 'is-closing' : ''}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose() }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={requestClose} aria-label="Fechar"><X size={19} /></button></div>{children}</div></div>,
    document.body,
  )
}
function Field({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: React.ReactNode }) { return <label className={`field ${wide ? 'wide' : ''}`}><span>{label}{required && <b>*</b>}</span>{children}</label> }

export default App
