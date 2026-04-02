'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Zap, Activity, Wifi, Database, Shield, BarChart3,
  RefreshCw, ChevronRight, Home, Send, History,
  Settings, Bell, Search, QrCode, Copy, Check,
  TrendingUp, TrendingDown, Clock, Globe, Lock,
  AlertCircle, CheckCircle, XCircle, Loader2
} from 'lucide-react'

const API_BASE = 'https://virtual-gateway.onrender.com'

type ApiStatus = 'loading' | 'online' | 'offline'

interface DeviceReading {
  id: string
  type: string
  value: number
  unit: string
  timestamp: string
  status: 'normal' | 'warning' | 'critical'
}

interface GatewayInfo {
  message: string
  version?: string
  uptime?: number
}

const ENDPOINTS = [
  { path: '/dcap', label: 'Device Capability', icon: Shield, color: '#7c4dff' },
  { path: '/edev', label: 'End Devices', icon: Wifi, color: '#00b9f1' },
  { path: '/mup', label: 'Mirror Usage', icon: Database, color: '#ff6d00' },
  { path: '/sdev', label: 'Self Device', icon: Zap, color: '#00c853' },
  { path: '/tm', label: 'Time', icon: Clock, color: '#f50057' },
  { path: '/dr', label: 'Demand Response', icon: Activity, color: '#ffd600' },
]

const MOCK_DEVICES: DeviceReading[] = [
  { id: 'DEV-001', type: 'Smart Meter', value: 4.82, unit: 'kWh', timestamp: new Date().toISOString(), status: 'normal' },
  { id: 'DEV-002', type: 'Solar Panel', value: 2.14, unit: 'kWh', timestamp: new Date().toISOString(), status: 'normal' },
  { id: 'DEV-003', type: 'EV Charger', value: 7.40, unit: 'kWh', timestamp: new Date().toISOString(), status: 'warning' },
  { id: 'DEV-004', type: 'HVAC Unit', value: 1.23, unit: 'kWh', timestamp: new Date().toISOString(), status: 'normal' },
]

export default function VCGApp() {
  const [activeTab, setActiveTab] = useState<'home' | 'devices' | 'history' | 'settings'>('home')
  const [apiStatus, setApiStatus] = useState<ApiStatus>('loading')
  const [gatewayInfo, setGatewayInfo] = useState<GatewayInfo | null>(null)
  const [endpointResults, setEndpointResults] = useState<Record<string, any>>({})
  const [loadingEndpoints, setLoadingEndpoints] = useState<Record<string, boolean>>({})
  const [devices] = useState<DeviceReading[]>(MOCK_DEVICES)
  const [showQR, setShowQR] = useState(false)
  const [copied, setCopied] = useState(false)
  const [totalEnergy, setTotalEnergy] = useState(15.59)
  const [notifications, setNotifications] = useState(3)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const appUrl = typeof window !== 'undefined' ? window.location.href : 'https://vcg-app.vercel.app'

  // Check API health
  const checkApiHealth = useCallback(async () => {
    setApiStatus('loading')
    try {
      const res = await fetch(API_BASE, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setGatewayInfo(data)
        setApiStatus('online')
      } else {
        setApiStatus('offline')
      }
    } catch {
      setApiStatus('offline')
    }
  }, [])

  useEffect(() => {
    checkApiHealth()
    // Simulate real-time energy fluctuation
    const interval = setInterval(() => {
      setTotalEnergy(prev => +(prev + (Math.random() - 0.4) * 0.1).toFixed(2))
    }, 3000)
    return () => clearInterval(interval)
  }, [checkApiHealth])

  // Fetch endpoint
  const fetchEndpoint = async (path: string) => {
    setLoadingEndpoints(prev => ({ ...prev, [path]: true }))
    try {
      const res = await fetch(API_BASE + path, { cache: 'no-store' })
      const contentType = res.headers.get('content-type') || ''
      let data: any
      if (contentType.includes('json')) {
        data = await res.json()
      } else {
        const text = await res.text()
        data = { raw: text, status: res.status }
      }
      setEndpointResults(prev => ({ ...prev, [path]: { data, status: res.status, ok: res.ok } }))
    } catch (e: any) {
      setEndpointResults(prev => ({ ...prev, [path]: { error: e.message, ok: false } }))
    } finally {
      setLoadingEndpoints(prev => ({ ...prev, [path]: false }))
    }
  }

  // Generate QR code
  useEffect(() => {
    if (showQR && canvasRef.current) {
      generateQR(appUrl, canvasRef.current)
    }
  }, [showQR, appUrl])

  async function generateQR(text: string, canvas: HTMLCanvasElement) {
    const size = 200
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    // Simple QR placeholder — real QR generated via API
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)

    // We'll use a free QR API to render the actual QR
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}&color=002970&bgcolor=ffffff&qzone=1`
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size)
    }
  }

  const copyUrl = () => {
    navigator.clipboard.writeText(appUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statusColor = apiStatus === 'online' ? '#00c853' : apiStatus === 'loading' ? '#ffd600' : '#ff1744'
  const statusLabel = apiStatus === 'online' ? 'Live' : apiStatus === 'loading' ? 'Connecting...' : 'Offline'

  return (
    <div style={{ maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#f0f4f8', position: 'relative', fontFamily: 'Nunito, sans-serif' }}>

      {/* HEADER */}
      <div className="paytm-header card-shine" style={{ padding: '20px 20px 80px', position: 'relative' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>MI6228 · Group 13</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>VCG Portal</div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={() => setNotifications(0)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 12, padding: '8px', cursor: 'pointer', position: 'relative' }}>
              <Bell size={18} color="#fff" />
              {notifications > 0 && <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, background: '#ff1744', borderRadius: '50%', display: 'block' }} />}
            </button>
            <button onClick={() => setShowQR(true)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 12, padding: '8px', cursor: 'pointer' }}>
              <QrCode size={18} color="#fff" />
            </button>
          </div>
        </div>

        {/* API Status card */}
        <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: '14px 18px', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5 }}>Gateway Status</div>
              <div style={{ fontSize: 13, color: '#fff', fontWeight: 800, marginTop: 2 }}>{API_BASE.replace('https://', '')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ position: 'relative', width: 8, height: 8 }}>
                  <div className={apiStatus === 'online' ? 'live-dot' : ''} style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, position: 'relative', zIndex: 1 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, color: statusColor }}>{statusLabel}</span>
              </div>
              <button onClick={checkApiHealth} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <RefreshCw size={10} color="#fff" className={apiStatus === 'loading' ? 'spinning' : ''} />
                <span style={{ fontSize: 10, color: '#fff' }}>Refresh</span>
              </button>
            </div>
          </div>
          {gatewayInfo && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(0,200,83,0.15)', borderRadius: 8, border: '1px solid rgba(0,200,83,0.3)' }}>
              <span style={{ fontSize: 11, color: '#00ff88', fontFamily: 'Space Mono, monospace' }}>{gatewayInfo.message}</span>
            </div>
          )}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ marginTop: -50, padding: '0 16px 100px' }}>

        {activeTab === 'home' && <HomeTab devices={devices} totalEnergy={totalEnergy} endpointResults={endpointResults} loadingEndpoints={loadingEndpoints} fetchEndpoint={fetchEndpoint} apiStatus={apiStatus} />}
        {activeTab === 'devices' && <DevicesTab devices={devices} />}
        {activeTab === 'history' && <HistoryTab />}
        {activeTab === 'settings' && <SettingsTab onShowQR={() => setShowQR(true)} />}
      </div>

      {/* BOTTOM NAV */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430,
        background: '#fff', borderTop: '1px solid #e8edf2',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        padding: '10px 0 16px', zIndex: 50, boxShadow: '0 -4px 20px rgba(0,0,0,0.08)'
      }}>
        {[
          { id: 'home', icon: Home, label: 'Home' },
          { id: 'devices', icon: Wifi, label: 'Devices' },
          { id: 'history', icon: History, label: 'Logs' },
          { id: 'settings', icon: Settings, label: 'Settings' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '4px 16px' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 14,
              background: activeTab === tab.id ? 'linear-gradient(135deg, #002970, #00b9f1)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s'
            }}>
              <tab.icon size={20} color={activeTab === tab.id ? '#fff' : '#94a3b8'} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: activeTab === tab.id ? '#002970' : '#94a3b8' }}>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* QR MODAL */}
      {showQR && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,41,112,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24
        }} onClick={() => setShowQR(false)}>
          <div style={{ background: '#fff', borderRadius: 28, padding: 32, textAlign: 'center', maxWidth: 320, width: '100%' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 900, fontSize: 18, color: '#002970', marginBottom: 4 }}>Scan to Open VCG</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>Share this app via QR code</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div style={{ border: '3px solid #00b9f1', borderRadius: 16, padding: 8, display: 'inline-block' }}>
                {/* QR via public API */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(appUrl)}&color=002970&bgcolor=ffffff&qzone=1`}
                  alt="QR Code"
                  width={180}
                  height={180}
                  style={{ borderRadius: 8, display: 'block' }}
                />
              </div>
            </div>
            <div style={{ background: '#f0f4f8', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Globe size={14} color="#00b9f1" />
              <span style={{ fontSize: 11, color: '#475569', flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Space Mono, monospace' }}>{appUrl}</span>
              <button onClick={copyUrl} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                {copied ? <Check size={14} color="#00c853" /> : <Copy size={14} color="#94a3b8" />}
              </button>
            </div>
            <button onClick={() => setShowQR(false)} style={{ width: '100%', background: 'linear-gradient(135deg, #002970, #00b9f1)', color: '#fff', border: 'none', borderRadius: 14, padding: '14px', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── HOME TAB ───────────────────────────────────────────────────────────────
function HomeTab({ devices, totalEnergy, endpointResults, loadingEndpoints, fetchEndpoint, apiStatus }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Energy Balance Card */}
      <div className="animate-slideup animate-slideup-d1" style={{
        background: 'linear-gradient(135deg, #002970 0%, #0052cc 50%, #00b9f1 100%)',
        borderRadius: 24, padding: 24, color: '#fff', boxShadow: '0 8px 32px rgba(0,41,112,0.25)'
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>Total Energy Today</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 42, fontWeight: 900, lineHeight: 1 }}>{totalEnergy.toFixed(2)}</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>kWh</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,200,83,0.2)', borderRadius: 20, padding: '4px 10px' }}>
            <TrendingUp size={12} color="#00ff88" />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#00ff88' }}>+2.4%</span>
          </div>
        </div>
        {/* Mini bars */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 40 }}>
          {[65, 80, 55, 90, 70, 85, 75, 95, 60, 88, 72, 91].map((h, i) => (
            <div key={i} className="wave-bar" style={{
              flex: 1, height: `${h}%`, background: 'rgba(255,255,255,0.3)',
              borderRadius: 3, animationDelay: `${i * 0.1}s`
            }} />
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="animate-slideup animate-slideup-d2" style={{ background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#002970', marginBottom: 16 }}>IEEE 2030.5 Endpoints</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {ENDPOINTS.map(ep => (
            <button key={ep.path} onClick={() => fetchEndpoint(ep.path)}
              style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 14, padding: '12px 8px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}
              onMouseOver={e => (e.currentTarget.style.borderColor = ep.color)}
              onMouseOut={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: ep.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                {loadingEndpoints[ep.path] ? <Loader2 size={16} color={ep.color} className="spinning" /> : <ep.icon size={16} color={ep.color} />}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', lineHeight: 1.2 }}>{ep.label}</div>
              {endpointResults[ep.path] && (
                <div style={{ marginTop: 4 }}>
                  {endpointResults[ep.path].ok
                    ? <span style={{ fontSize: 9, color: '#00c853', fontWeight: 700 }}>✓ {endpointResults[ep.path].status}</span>
                    : <span style={{ fontSize: 9, color: '#ff1744', fontWeight: 700 }}>✗ Error</span>}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Endpoint Response */}
      {Object.keys(endpointResults).length > 0 && (
        <div className="animate-slideup" style={{ background: '#0d1117', borderRadius: 20, padding: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.12)' }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#00b9f1', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Database size={14} />
            API Responses
          </div>
          {Object.entries(endpointResults).map(([path, result]: [string, any]) => (
            <div key={path} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                {result.ok ? <CheckCircle size={12} color="#00c853" /> : <XCircle size={12} color="#ff1744" />}
                <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, color: '#00b9f1' }}>{path}</span>
                <span style={{ fontSize: 10, color: result.ok ? '#00c853' : '#ff1744', marginLeft: 'auto', fontFamily: 'Space Mono' }}>{result.status || 'ERR'}</span>
              </div>
              <pre style={{ background: '#161b22', borderRadius: 10, padding: 12, fontSize: 10, color: '#e2e8f0', overflowX: 'auto', fontFamily: 'Space Mono, monospace', lineHeight: 1.6, maxHeight: 150, overflow: 'auto' }}>
                {JSON.stringify(result.data || result.error, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}

      {/* Platform Status */}
      <div className="animate-slideup animate-slideup-d3" style={{ background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#002970', marginBottom: 14 }}>Platform Stack</div>
        {[
          { name: 'FIWARE Orion', port: 1026, color: '#7c4dff', icon: Globe },
          { name: 'InfluxDB', port: 8086, color: '#ff6d00', icon: Database },
          { name: 'Grafana', port: 3000, color: '#f50057', icon: BarChart3 },
          { name: 'IDS Connector', port: 8181, color: '#00b9f1', icon: Shield },
        ].map((svc, i) => (
          <div key={svc.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < 3 ? '1px solid #f1f5f9' : 'none' }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: svc.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svc.icon size={16} color={svc.color} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{svc.name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Space Mono, monospace' }}>:{svc.port}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00c853' }} />
              <span style={{ fontSize: 11, color: '#00c853', fontWeight: 700 }}>Active</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── DEVICES TAB ─────────────────────────────────────────────────────────────
function DevicesTab({ devices }: { devices: DeviceReading[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '16px 20px', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#002970', marginBottom: 4 }}>Connected Devices</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>IEEE 2030.5 End Devices</div>
      </div>
      {devices.map((dev, i) => (
        <div key={dev.id} className="animate-slideup" style={{
          background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
          animationDelay: `${i * 0.08}s`, opacity: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: dev.status === 'normal' ? '#00c85318' : dev.status === 'warning' ? '#ffd60018' : '#ff174418'
              }}>
                <Zap size={22} color={dev.status === 'normal' ? '#00c853' : dev.status === 'warning' ? '#ffd600' : '#ff1744'} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>{dev.type}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'Space Mono, monospace' }}>{dev.id}</div>
                <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, background: dev.status === 'normal' ? '#00c85315' : '#ffd60015', borderRadius: 20, padding: '3px 10px' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: dev.status === 'normal' ? '#00c853' : '#ffd600' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: dev.status === 'normal' ? '#00c853' : '#b8960c', textTransform: 'uppercase', letterSpacing: 1 }}>{dev.status}</span>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#002970' }}>{dev.value}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>{dev.unit}</div>
            </div>
          </div>
          {/* Usage bar */}
          <div style={{ marginTop: 14, background: '#f1f5f9', borderRadius: 4, height: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(dev.value / 10) * 100}%`, background: 'linear-gradient(90deg, #002970, #00b9f1)', borderRadius: 4, transition: 'width 1s ease' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── HISTORY TAB ─────────────────────────────────────────────────────────────
function HistoryTab() {
  const logs = Array.from({ length: 12 }, (_, i) => ({
    id: `LOG-${1000 + i}`,
    event: ['DER Reading', 'Device Auth', 'Data Sync', 'FIWARE Push', 'IDS Exchange', 'Meter Update'][i % 6],
    time: new Date(Date.now() - i * 7 * 60 * 1000).toLocaleTimeString(),
    status: i % 5 === 0 ? 'warning' : 'success',
    protocol: ['IEEE 2030.5', 'FIWARE', 'IDS', 'MQTT', 'REST'][i % 5]
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '16px 20px', boxShadow: '0 2px 16px rgba(0,0,0,0.06)', marginBottom: 4 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#002970' }}>Activity Log</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>Gateway event history</div>
      </div>
      {logs.map((log, i) => (
        <div key={log.id} style={{ background: '#fff', borderRadius: 16, padding: '14px 18px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: log.status === 'success' ? '#00c85315' : '#ffd60015', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {log.status === 'success' ? <CheckCircle size={16} color="#00c853" /> : <AlertCircle size={16} color="#ffd600" />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{log.event}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'Space Mono, monospace' }}>{log.id} · {log.protocol}</div>
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'Space Mono, monospace', textAlign: 'right' }}>
            <div>{log.time}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── SETTINGS TAB ─────────────────────────────────────────────────────────────
function SettingsTab({ onShowQR }: { onShowQR: () => void }) {
  const info = [
    { label: 'Student ID', value: 'MI6228' },
    { label: 'Group', value: '13' },
    { label: 'Mentor', value: 'Paolo Cammardella' },
    { label: 'API Base', value: 'virtual-gateway.onrender.com' },
    { label: 'Protocol', value: 'IEEE 2030.5' },
    { label: 'Platform', value: 'FIWARE + IDS Dataspace' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Profile card */}
      <div style={{ background: 'linear-gradient(135deg, #002970, #00b9f1)', borderRadius: 24, padding: 24, color: '#fff', boxShadow: '0 8px 32px rgba(0,41,112,0.25)' }}>
        <div style={{ width: 60, height: 60, borderRadius: 20, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, fontSize: 28 }}>👤</div>
        <div style={{ fontWeight: 900, fontSize: 20 }}>Ronit</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Virtual Communication Gateway</div>
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 14px' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase' }}>Student</div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>MI6228</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '6px 14px' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase' }}>Group</div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>13</div>
          </div>
        </div>
      </div>

      {/* Info */}
      <div style={{ background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#002970', marginBottom: 14 }}>Project Info</div>
        {info.map((item, i) => (
          <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < info.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{item.label}</span>
            <span style={{ fontSize: 12, color: '#002970', fontWeight: 800, fontFamily: item.label === 'API Base' || item.label === 'Student ID' ? 'Space Mono, monospace' : 'inherit', maxWidth: '55%', textAlign: 'right' }}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ background: '#fff', borderRadius: 20, padding: 20, boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: '#002970', marginBottom: 14 }}>Quick Actions</div>
        {[
          { label: 'Show QR Code', icon: QrCode, color: '#00b9f1', action: onShowQR },
          { label: 'Open GitHub Repo', icon: Globe, color: '#1e293b', action: () => window.open('https://github.com/rt0181996/virtual-gateway', '_blank') },
          { label: 'API Documentation', icon: Database, color: '#7c4dff', action: () => window.open('https://virtual-gateway.onrender.com/docs', '_blank') },
          { label: 'Grafana Dashboard', icon: BarChart3, color: '#f50057', action: () => alert('Grafana runs locally on port 3000') },
        ].map((action, i) => (
          <button key={action.label} onClick={action.action}
            style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < 3 ? '1px solid #f1f5f9' : 'none' }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: action.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <action.icon size={16} color={action.color} />
            </div>
            <span style={{ flex: 1, textAlign: 'left', fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{action.label}</span>
            <ChevronRight size={14} color="#cbd5e1" />
          </button>
        ))}
      </div>

      <div style={{ textAlign: 'center', padding: '8px', fontSize: 11, color: '#94a3b8', fontFamily: 'Space Mono, monospace' }}>
        VCG v1.0 · IEEE 2030.5 · Group 13
      </div>
    </div>
  )
}
