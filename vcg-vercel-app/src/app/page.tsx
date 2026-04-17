'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

const API = 'https://virtual-gateway.onrender.com'
const API_V1 = 'https://virtual-gateway.onrender.com/api/v1'
const FIWARE = 'http://localhost:1026' // Local Orion broker
const APP_URL = 'https://vcg-webapp.vercel.app'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Block { id:string;name:string;location:string;emoji:string;generation:number;consumption:number;net:number;status:'Surplus'|'Deficit'|'Balanced';devices:number;color:string;lat:number;lng:number }
interface Sensor { icon:string;label:string;value:number;unit:string;color:string;bar:number }
interface EV { id:string;block:string;status:'CHARGING'|'IDLE';power:number;sessionTime:number;soc:number }
interface Device { sfdi:string;lfdi?:string;type:string;block:string;status:string;power?:number;voltage?:number;lastSeen?:string }
interface Alert { id:string;block:string;type:string;message:string;severity:'high'|'medium'|'low';time:string;read:boolean }
interface HistoryEntry { time:string;block:string;generation:number;consumption:number;net:number;cost:number }
interface Notification { id:string;title:string;message:string;type:'info'|'warning'|'error'|'success';time:string;read:boolean }
interface SimReading { deviceId:string;type:string;block:string;power:number;voltage:number;temperature:number;timestamp:string;sent:boolean }
type Screen = 'home'|'block'|'charts'|'alerts'|'demand'|'history'|'cost'|'devices'|'map'|'compare'|'register'|'import'|'settings'|'simulator'|'fiware'|'architecture'|'report'|'ngsi'|'group12'

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeSensors=(t=20,sol=600,bat=50,gi=1,ge=1,ws=25,ec=0.38,co2=2):Sensor[]=>[
  {icon:'🌡️',label:'Temperature',     value:t,   unit:'°C',   color:'#f97316',bar:Math.min(Math.round(t/40*100),100)},
  {icon:'☀️',label:'Solar Irradiance', value:sol, unit:'W/m²', color:'#ffd60a',bar:Math.min(Math.round(sol/1000*100),100)},
  {icon:'🔋',label:'Battery SOC',      value:bat, unit:'%',    color:'#10b981',bar:bat},
  {icon:'🔌',label:'Grid Import',      value:gi,  unit:'kW',   color:'#e63946',bar:Math.min(Math.round(gi/5*100),100)},
  {icon:'📤',label:'Grid Export',      value:ge,  unit:'kW',   color:'#58c4dc',bar:Math.min(Math.round(ge/5*100),100)},
  {icon:'💨',label:'Wind Speed',       value:ws,  unit:'km/h', color:'#3b82f6',bar:Math.min(Math.round(ws/60*100),100)},
  {icon:'€', label:'Energy Cost',      value:ec,  unit:'/kWh', color:'#ffd60a',bar:Math.min(Math.round(ec/0.6*100),100)},
  {icon:'🌿',label:'CO₂ Saved',        value:co2, unit:'kg',   color:'#10b981',bar:Math.min(Math.round(co2/8*100),100)},
]
const makeHistory=(blockId:string,count=12):HistoryEntry[]=>{
  const now=new Date()
  return Array.from({length:count},(_,i)=>{
    const gen=+(100+Math.random()*100).toFixed(1), con=+(70+Math.random()*90).toFixed(1)
    const d=new Date(now); d.setHours(d.getHours()-count+i)
    return {time:d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),block:blockId,generation:gen,consumption:con,net:+(gen-con).toFixed(1),cost:+(con*0.38/1000*3600).toFixed(3)}
  })
}

// ── Data ──────────────────────────────────────────────────────────────────────
const INIT_BLOCKS:Block[]=[
  {id:'BLK-A',name:'Block A',location:'Dublin',  emoji:'🏙️',generation:145.8,consumption:98.2, net:47.6, status:'Surplus', devices:12,color:'#e63946',lat:53.3498,lng:-6.2603},
  {id:'BLK-B',name:'Block B',location:'Kerry',   emoji:'🏘️',generation:82.3, consumption:110.7,net:-28.4,status:'Deficit', devices:8, color:'#ffd60a',lat:52.1545,lng:-9.5669},
  {id:'BLK-C',name:'Block C',location:'Galway',  emoji:'🌆',generation:200.1,consumption:195.4,net:4.7,  status:'Surplus', devices:15,color:'#58c4dc',lat:53.2707,lng:-9.0568},
  {id:'BLK-D',name:'Block D',location:'Limerick',emoji:'🌉',generation:134.5,consumption:89.0, net:45.5, status:'Surplus', devices:10,color:'#10b981',lat:52.6638,lng:-8.6267},
]
const INIT_SENSORS:Record<string,Sensor[]>={'BLK-A':makeSensors(20.3,693,43,0.57,1.85,29,0.386,2.2),'BLK-B':makeSensors(18.1,510,22,3.2,0.4,41,0.42,0.8),'BLK-C':makeSensors(22.7,820,78,0.12,4.6,17,0.31,5.1),'BLK-D':makeSensors(19.5,640,61,0.88,2.3,23,0.355,3.4)}
const INIT_EVS:EV[]=[
  {id:'EVCharger001',block:'BLK-A',status:'CHARGING',power:7.4,sessionTime:42,soc:68},
  {id:'EVCharger002',block:'BLK-B',status:'IDLE',    power:0,  sessionTime:0, soc:95},
  {id:'EVCharger003',block:'BLK-C',status:'CHARGING',power:11.0,sessionTime:18,soc:34},
  {id:'EVCharger004',block:'BLK-D',status:'IDLE',    power:0,  sessionTime:0, soc:82},
]
const INIT_DEVICES:Device[]=[
  {sfdi:'SM-A001',lfdi:'LFDI-SM-A001',type:'Smart Meter',    block:'BLK-A',status:'Online', power:1400,voltage:230,lastSeen:'Just now'},
  {sfdi:'PV-A002',lfdi:'LFDI-PV-A002',type:'Solar Inverter', block:'BLK-A',status:'Online', power:3500,voltage:230,lastSeen:'1 min ago'},
  {sfdi:'EV-A003',lfdi:'LFDI-EV-A003',type:'EV Charger',     block:'BLK-A',status:'Online', power:7400,voltage:230,lastSeen:'Just now'},
  {sfdi:'SM-B001',lfdi:'LFDI-SM-B001',type:'Smart Meter',    block:'BLK-B',status:'Online', power:1200,voltage:230,lastSeen:'2 min ago'},
  {sfdi:'BA-B002',lfdi:'LFDI-BA-B002',type:'Battery Storage', block:'BLK-B',status:'Warning',power:5000,voltage:48, lastSeen:'5 min ago'},
  {sfdi:'SM-C001',lfdi:'LFDI-SM-C001',type:'Smart Meter',    block:'BLK-C',status:'Online', power:1400,voltage:230,lastSeen:'Just now'},
  {sfdi:'WT-C002',lfdi:'LFDI-WT-C002',type:'Wind Turbine',   block:'BLK-C',status:'Online', power:8000,voltage:400,lastSeen:'30s ago'},
  {sfdi:'SM-D001',lfdi:'LFDI-SM-D001',type:'Smart Meter',    block:'BLK-D',status:'Online', power:1400,voltage:230,lastSeen:'3 min ago'},
]

// ── Theme tokens ──────────────────────────────────────────────────────────────
const DARK = {
  bg:'#0a0c10', bg2:'#0d1117', card:'#13181f', card2:'#1a2030',
  text:'#f0e6d3', text2:'#a89880', text3:'#5a4a38',
  border:'rgba(255,214,10,0.15)', red:'#e63946', gold:'#ffd60a', arc:'#58c4dc',
  green:'#10b981', amber:'#f59e0b', navy:'#0d1117',
  redLight:'rgba(230,57,70,0.18)', goldLight:'rgba(255,214,10,0.15)',
  arcLight:'rgba(88,196,220,0.12)', greenL:'rgba(16,185,129,0.12)',
  amberL:'rgba(245,158,11,0.12)',
}
const LIGHT = {
  bg:'#f4f5fa', bg2:'#eef0f7', card:'#ffffff', card2:'#f8faff',
  text:'#0d1117', text2:'#4a5568', text3:'#9aa5b4',
  border:'#e2e6f0', red:'#e63946', gold:'#d4a017', arc:'#0891b2',
  green:'#10b981', amber:'#f59e0b', navy:'#0d1117',
  redLight:'#ffd6d8', goldLight:'#fff5cc', arcLight:'#e0f7ff',
  greenL:'#d1fae5', amberL:'#fef3c7',
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function VCGApp() {
  const [screen,setScreen]=useState<Screen>('home')
  const [darkMode,setDarkMode]=useState(true)
  // Follow system color scheme
  useEffect(()=>{
    const mq=window.matchMedia('(prefers-color-scheme: dark)')
    setDarkMode(mq.matches)
    const handler=(e:MediaQueryListEvent)=>setDarkMode(e.matches)
    mq.addEventListener('change',handler)
    return ()=>mq.removeEventListener('change',handler)
  },[])
  const [activeBlock,setActiveBlock]=useState<Block|null>(null)
  const [activeDevice,setActiveDevice]=useState<Device|null>(null)
  const [apiOnline,setApiOnline]=useState<boolean|null>(null)
  const [apiMsg,setApiMsg]=useState('')
  const [isOffline,setIsOffline]=useState(false)
  const [blocks,setBlocks]=useState<Block[]>(()=>{
    try{const s=localStorage.getItem('vcg_blocks');return s?JSON.parse(s):INIT_BLOCKS}catch{return INIT_BLOCKS}
  })
  const [sensors,setSensors]=useState<Record<string,Sensor[]>>(INIT_SENSORS)
  const [evs,setEvs]=useState<EV[]>(INIT_EVS)
  const [devices,setDevices]=useState<Device[]>(()=>{
    try{const s=localStorage.getItem('vcg_devices');return s?JSON.parse(s):INIT_DEVICES}catch{return INIT_DEVICES}
  })
  const [alerts,setAlerts]=useState<Alert[]>([])
  const [notifications,setNotifications]=useState<Notification[]>([])
  const [history,setHistory]=useState<Record<string,HistoryEntry[]>>({'BLK-A':makeHistory('BLK-A'),'BLK-B':makeHistory('BLK-B'),'BLK-C':makeHistory('BLK-C'),'BLK-D':makeHistory('BLK-D')})
  const [showQR,setShowQR]=useState(false)
  const [installPrompt,setInstallPrompt]=useState<any>(null)
  const [showInstallBanner,setShowInstallBanner]=useState(false)
  const [installed,setInstalled]=useState(false)

  useEffect(()=>{
    const handler=(e:any)=>{
      e.preventDefault()
      setInstallPrompt(e)
      setShowInstallBanner(true)
    }
    window.addEventListener('beforeinstallprompt',handler)
    window.addEventListener('appinstalled',()=>{setInstalled(true);setShowInstallBanner(false)})
    return ()=>window.removeEventListener('beforeinstallprompt',handler)
  },[])

  const handleInstall=async()=>{
    if(!installPrompt) return
    installPrompt.prompt()
    const result=await installPrompt.userChoice
    if(result.outcome==='accepted'){setInstalled(true);setShowInstallBanner(false)}
    setInstallPrompt(null)
  }
  const [demoMode,setDemoMode]=useState(false)
  const demoRef=useRef<any>(null)

  const DEMO_SCREENS:Screen[]=['home','charts','alerts','demand','history','cost','devices','map','compare']
  const [demoIdx,setDemoIdx]=useState(0)

  useEffect(()=>{
    if(demoMode){
      setScreen(DEMO_SCREENS[0]);setDemoIdx(0)
      demoRef.current=setInterval(()=>{
        setDemoIdx(p=>{
          const next=(p+1)%DEMO_SCREENS.length
          setScreen(DEMO_SCREENS[next])
          return next
        })
      },4000)
    } else {
      if(demoRef.current) clearInterval(demoRef.current)
    }
    return ()=>{ if(demoRef.current) clearInterval(demoRef.current) }
  },[demoMode])
  const [loading,setLoading]=useState(true)
  const [pinLocked,setPinLocked]=useState(()=>{
    try{ return localStorage.getItem('vcg_pin_enabled')==='true' }catch{ return false }
  })
  const [pinUnlocked,setPinUnlocked]=useState(false)
  const [savedPin,setSavedPin]=useState(()=>{
    try{ return localStorage.getItem('vcg_pin')||'' }catch{ return '' }
  })

  useEffect(()=>{
    const t=setTimeout(()=>setLoading(false), 2800)
    return ()=>clearTimeout(t)
  },[])
  const [showNotifPanel,setShowNotifPanel]=useState(false)
  const [copied,setCopied]=useState(false)

  const T = darkMode ? DARK : LIGHT

  // ── 5. Offline detection ─────────────────────────────────────────────────
  useEffect(()=>{
    const handleOnline=()=>{ setIsOffline(false); addNotification({title:'Back Online',message:'Connection restored — syncing data',type:'success'}) }
    const handleOffline=()=>{ setIsOffline(true); addNotification({title:'Offline Mode',message:'No internet connection. Using cached data.',type:'warning'}) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOffline(!navigator.onLine)
    return ()=>{ window.removeEventListener('online',handleOnline); window.removeEventListener('offline',handleOffline) }
  },[])

  // ── Live data fluctuation ────────────────────────────────────────────────
  useEffect(()=>{
    const iv=setInterval(()=>{
      setBlocks(p=>p.map(b=>{
        const gen=+(b.generation+(Math.random()-0.5)*2).toFixed(1)
        const con=+(b.consumption+(Math.random()-0.5)*1.5).toFixed(1)
        const net=+(gen-con).toFixed(1)
        return{...b,generation:gen,consumption:con,net,status:net>0.5?'Surplus':net<-0.5?'Deficit':'Balanced'}
      }))
      setSensors(p=>{const n={...p};Object.keys(n).forEach(k=>{n[k]=n[k].map((s,i)=>{const d=[0.3,8,1.5,0.04,0.08,0.8,0.004,0.08][i]||0.1;return{...s,value:+(s.value+(Math.random()-0.5)*d).toFixed(s.value<10?2:1)}})});return n})
      setHistory(p=>{const n={...p};INIT_BLOCKS.forEach(b=>{const gen=+(100+Math.random()*100).toFixed(1),con=+(70+Math.random()*90).toFixed(1);const e:HistoryEntry={time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),block:b.id,generation:gen,consumption:con,net:+(gen-con).toFixed(1),cost:+(con*0.38/1000*3600).toFixed(3)};n[b.id]=[...(n[b.id]||[]).slice(-20),e]});return n})
    },3000)
    return ()=>clearInterval(iv)
  },[])

  // ── 4. Auto notifications ───────────────────────────────────────────────
  useEffect(()=>{
    const a:Alert[]=[]
    blocks.forEach(b=>{
      if(b.status==='Deficit'){
        a.push({id:`${b.id}-d`,block:b.id,type:'deficit',message:`${b.name} is in deficit — ${Math.abs(b.net).toFixed(1)} kW shortfall`,severity:'high',time:'Now',read:false})
        addNotification({title:`⚡ ${b.name} Deficit`,message:`Energy shortfall of ${Math.abs(b.net).toFixed(1)} kW detected`,type:'error'})
      }
      const bat=sensors[b.id]?.find(s=>s.label==='Battery SOC')
      if(bat&&bat.value<25){
        a.push({id:`${b.id}-b`,block:b.id,type:'battery',message:`Battery in ${b.name} critically low: ${bat.value}%`,severity:'high',time:'Now',read:false})
        addNotification({title:`🔋 Battery Low: ${b.name}`,message:`Battery SOC is ${bat.value}% — needs attention`,type:'warning'})
      }
    })
    setAlerts(a)
  },[blocks])

  const addNotification=(n:Omit<Notification,'id'|'time'|'read'>)=>{
    setNotifications(p=>{
      const exists=p.find(x=>x.title===n.title)
      if(exists) return p
      const newN:Notification={...n,id:Date.now().toString(),time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),read:false}
      return [newN,...p].slice(0,20)
    })
  }

  // ── localStorage: save blocks/devices on change ──────────────────────────
  useEffect(()=>{
    try{localStorage.setItem('vcg_blocks',JSON.stringify(blocks))}catch{}
  },[blocks])
  useEffect(()=>{
    try{localStorage.setItem('vcg_devices',JSON.stringify(devices))}catch{}
  },[devices])
  useEffect(()=>{
    try{localStorage.setItem('vcg_sensors',JSON.stringify(sensors))}catch{}
  },[sensors])

  // ── Weather API (OpenWeatherMap free) ────────────────────────────────────
  const WEATHER_KEY = 'bd5e378503939ddaee76f12ad7a97608' // free demo key
  const CITY_COORDS:Record<string,[number,number]> = {
    'Dublin':  [53.3498, -6.2603],
    'Kerry':   [52.1545, -9.5669],
    'Galway':  [53.2707, -9.0568],
    'Limerick':[52.6638, -8.6267],
  }
  const fetchWeather=useCallback(async(city:string)=>{
    try{
      const [lat,lon]=CITY_COORDS[city]||[53.3498,-6.2603]
      const r=await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_KEY}&units=metric`)
      if(r.ok){
        const d=await r.json()
        return {
          temp:+(d.main?.temp||20).toFixed(1),
          humidity:d.main?.humidity||60,
          windSpeed:+(d.wind?.speed||5*3.6).toFixed(1),
          solar:d.clouds?.all?Math.round(900*(1-d.clouds.all/100)):600,
          desc:d.weather?.[0]?.description||'',
          icon:d.weather?.[0]?.icon||'01d',
          city,
        }
      }
    }catch{}
    return null
  },[])

  const [weatherData,setWeatherData]=useState<Record<string,any>>({})

  useEffect(()=>{
    const loadWeather=async()=>{
      const cities=['Dublin','Kerry','Galway','Limerick']
      const results:Record<string,any>={}
      for(const city of cities){
        const w=await fetchWeather(city)
        if(w) results[city]=w
      }
      if(Object.keys(results).length>0){
        setWeatherData(results)
        // Update sensor temps and solar with real weather
        setSensors(prev=>{
          const n={...prev}
          INIT_BLOCKS.forEach(b=>{
            const w=results[b.location]
            if(w&&n[b.id]){
              n[b.id]=n[b.id].map(s=>{
                if(s.label==='Temperature') return {...s,value:w.temp,bar:Math.min(Math.round(w.temp/40*100),100)}
                if(s.label==='Solar Irradiance') return {...s,value:w.solar,bar:Math.min(Math.round(w.solar/1000*100),100)}
                if(s.label==='Wind Speed') return {...s,value:+(w.windSpeed*3.6).toFixed(1),bar:Math.min(Math.round(w.windSpeed*3.6/60*100),100)}
                return s
              })
            }
          })
          return n
        })
        addNotification({title:'🌤️ Weather Updated',message:'Live weather data loaded for all communities',type:'success'})
      }
    }
    loadWeather()
    const iv=setInterval(loadWeather,600000) // refresh every 10 min
    return ()=>clearInterval(iv)
  },[])

  const [endpointHealth,setEndpointHealth]=useState<Record<string,{status:'ok'|'error'|'checking';latency:number}>>({})

  const checkEndpoints=useCallback(async()=>{
    const endpoints=['/api/v1/edev','/api/v1/dr/events','/api/v1/readings','/api/v1/mup','/api/v1/dcap']
    for(const ep of endpoints){
      setEndpointHealth(p=>({...p,[ep]:{status:'checking',latency:0}}))
      const start=Date.now()
      try{
        const controller=new AbortController()
        const timer=setTimeout(()=>controller.abort(),8000)
        // no-cors bypasses CORS restriction — opaque response = server is alive
        await fetch('https://virtual-gateway.onrender.com'+ep,{
          method:'GET',mode:'no-cors',signal:controller.signal
        })
        clearTimeout(timer)
        setEndpointHealth(p=>({...p,[ep]:{status:'ok',latency:Date.now()-start}}))
      }catch{
        setEndpointHealth(p=>({...p,[ep]:{status:'error',latency:Date.now()-start}}))
      }
    }
  },[])

  const checkApi=useCallback(async()=>{
    if(isOffline){setApiOnline(false);setApiMsg('Offline mode');return}
    setApiOnline(null)
    try{const r=await fetch(API);const d=await r.json();setApiOnline(true);setApiMsg(d.message||'Connected');addNotification({title:'API Connected',message:d.message||'Gateway is online',type:'success'});checkEndpoints()}
    catch{setApiOnline(false);setApiMsg('API offline')}
  },[isOffline])
  useEffect(()=>{checkApi()},[])

  const addBlock=(b:Block)=>{setBlocks(p=>[...p,b]);setSensors(p=>({...p,[b.id]:makeSensors()}));setEvs(p=>[...p,{id:`EVC-${b.id}`,block:b.id,status:'IDLE',power:0,sessionTime:0,soc:100}]);setHistory(p=>({...p,[b.id]:makeHistory(b.id)}))}
  const addDevice=(d:Device)=>{setDevices(p=>[...p,d]);addNotification({title:'Device Registered',message:`${d.sfdi} added to ${d.block}`,type:'success'})}
  const goHome=()=>{setScreen('home');setActiveBlock(null);setActiveDevice(null)}
  const openBlock=(b:Block)=>{setActiveBlock(b);setScreen('block')}

  const totalGen=blocks.reduce((s,b)=>s+b.generation,0)
  const totalCon=blocks.reduce((s,b)=>s+b.consumption,0)
  const totalNet=+(totalGen-totalCon).toFixed(1)
  const unreadAlerts=alerts.filter(a=>!a.read).length
  const unreadNotifs=notifications.filter(n=>!n.read).length
  const statusColor=isOffline?T.amber:apiOnline===null?T.amber:apiOnline?T.green:T.red

  const NAV=[
    {id:'home',    icon:'🏠',label:'Home'},
    {id:'charts',  icon:'📈',label:'Charts'},
    {id:'alerts',  icon:'⚠️',label:'Alerts',badge:unreadAlerts},
    {id:'demand',  icon:'⚡',label:'Demand'},
    {id:'settings',icon:'⚙️',label:'More'},
  ]

  // CSS-in-JS theme helpers
  const cardStyle=(x?:React.CSSProperties):React.CSSProperties=>({
    background:darkMode?'rgba(19,24,31,0.92)':'rgba(255,255,255,0.92)',
    backdropFilter:'blur(16px)',
    WebkitBackdropFilter:'blur(16px)',
    borderRadius:20,padding:20,
    boxShadow:darkMode
      ?'0 8px 32px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,214,10,0.05),0 0 0 1px rgba(255,214,10,0.08)'
      :'0 8px 32px rgba(0,0,0,0.08),inset 0 1px 0 rgba(255,255,255,0.9)',
    border:darkMode?'1px solid rgba(255,214,10,0.12)':`1px solid ${T.border}`,
    ...x
  })
  const ironBtn=(x?:React.CSSProperties):React.CSSProperties=>({background:`linear-gradient(135deg,#8b0000,#c1121f,#e63946)`,color:'#fff',border:'none',borderRadius:14,padding:'13px',fontWeight:800,fontSize:14,cursor:'pointer',width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,boxShadow:'0 4px 20px rgba(230,57,70,0.5),inset 0 1px 0 rgba(255,255,255,0.1)',letterSpacing:0.5,...x})
  const goldBtn=(x?:React.CSSProperties):React.CSSProperties=>({background:`linear-gradient(135deg,#b8860b,#e5b800,#ffd60a)`,color:'#0d1117',border:'none',borderRadius:14,padding:'13px',fontWeight:800,fontSize:14,cursor:'pointer',width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,boxShadow:'0 4px 20px rgba(255,214,10,0.4),inset 0 1px 0 rgba(255,255,255,0.2)',letterSpacing:0.5,...x})
  const pill=(color:string):React.CSSProperties=>({fontFamily:"'Share Tech Mono',monospace",fontSize:10,letterSpacing:1.5,padding:'3px 10px',borderRadius:20,textTransform:'uppercase' as const,background:color+'25',border:`1px solid ${color}60`,color})
  const lbl:React.CSSProperties={fontSize:12,fontWeight:700,color:T.text2,display:'block',marginBottom:6}
  const inp=(x?:React.CSSProperties):React.CSSProperties=>({width:'100%',padding:'11px 14px',border:`1.5px solid ${T.border}`,borderRadius:12,fontSize:14,fontFamily:'Plus Jakarta Sans,sans-serif',color:T.text,background:T.card2,outline:'none',...x})

  if(pinLocked && savedPin && !pinUnlocked) return (
    <PinScreen onUnlock={()=>setPinUnlocked(true)} savedPin={savedPin} />
  )

  if(loading) return (
    <div style={{position:'fixed',inset:0,background:'#0d1117',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',zIndex:9999,fontFamily:'Plus Jakarta Sans,sans-serif'}}>
      <style>{`
        @keyframes arcSpin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
        @keyframes arcPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.6;transform:scale(0.95)}}
        @keyframes arcGlow{0%,100%{box-shadow:0 0 20px rgba(88,196,220,0.5),0 0 60px rgba(88,196,220,0.2)}50%{box-shadow:0 0 40px rgba(88,196,220,0.9),0 0 100px rgba(88,196,220,0.4)}}
        @keyframes fadeInUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes loadBar{from{width:0}to{width:100%}}
        @keyframes particleFloat{0%{transform:translateY(0px) translateX(0px);opacity:0.8}50%{transform:translateY(-20px) translateX(10px);opacity:0.4}100%{transform:translateY(0px) translateX(0px);opacity:0.8}}
      `}</style>

      {/* Particles */}
      {[...Array(12)].map((_,i)=>(
        <div key={i} style={{position:'absolute',width:3,height:3,borderRadius:'50%',background:'#58c4dc',opacity:0.6,
          top:`${10+Math.sin(i*30)*40}%`,left:`${10+Math.cos(i*30)*40}%`,
          animation:`particleFloat ${2+i*0.3}s ease-in-out infinite`,animationDelay:`${i*0.2}s`}}/>
      ))}

      {/* Arc Reactor */}
      <div style={{position:'relative',width:140,height:140,marginBottom:32,animation:'arcGlow 2s ease-in-out infinite'}}>
        {/* Outer ring */}
        <div style={{position:'absolute',inset:0,borderRadius:'50%',border:'2px solid rgba(88,196,220,0.3)',animation:'arcSpin 8s linear infinite'}}/>
        {/* Spinning ring */}
        <div style={{position:'absolute',inset:8,borderRadius:'50%',border:'3px solid transparent',borderTopColor:'#58c4dc',borderRightColor:'#58c4dc',animation:'arcSpin 2s linear infinite'}}/>
        {/* Second ring */}
        <div style={{position:'absolute',inset:16,borderRadius:'50%',border:'2px solid transparent',borderTopColor:'#e63946',animation:'arcSpin 3s linear infinite reverse'}}/>
        {/* Third ring */}
        <div style={{position:'absolute',inset:24,borderRadius:'50%',border:'2px solid rgba(255,214,10,0.5)',animation:'arcSpin 6s linear infinite'}}/>
        {/* Core */}
        <div style={{position:'absolute',inset:32,borderRadius:'50%',background:'radial-gradient(circle,#58c4dc,#0d4f6e)',animation:'arcPulse 1.5s ease-in-out infinite',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{color:'#fff',fontSize:28}}>⚡</div>
        </div>
        {/* Hex marks */}
        {[0,60,120,180,240,300].map(angle=>(
          <div key={angle} style={{position:'absolute',width:8,height:8,borderRadius:2,background:'#58c4dc',opacity:0.7,
            top:`${50-46*Math.cos(angle*Math.PI/180)}%`,left:`${50+46*Math.sin(angle*Math.PI/180)}%`,transform:'translate(-50%,-50%)'}}/>
        ))}
      </div>

      {/* Title */}
      <div style={{fontFamily:"'Orbitron',monospace",fontSize:22,fontWeight:900,color:'#fff',letterSpacing:4,animation:'fadeInUp 0.6s ease forwards',marginBottom:6}}>VCG PORTAL</div>
      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'#ffd60a',letterSpacing:3,animation:'fadeInUp 0.6s ease 0.2s forwards',opacity:0,marginBottom:4}}>MI6228 · GROUP 13</div>
      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'rgba(88,196,220,0.7)',letterSpacing:2,animation:'fadeInUp 0.6s ease 0.4s forwards',opacity:0,marginBottom:32}}>IEEE 2030.5 · FIWARE · IDS DATASPACE</div>

      {/* Loading bar */}
      <div style={{width:200,height:3,background:'rgba(255,255,255,0.1)',borderRadius:2,overflow:'hidden',marginBottom:12}}>
        <div style={{height:'100%',background:'linear-gradient(90deg,#e63946,#ffd60a,#58c4dc)',borderRadius:2,animation:'loadBar 2.5s ease forwards'}}/>
      </div>
      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'rgba(88,196,220,0.6)',letterSpacing:2,animation:'blink 1s ease-in-out infinite'}}>INITIALIZING GATEWAY...</div>
    </div>
  )

  return (
    <div style={{maxWidth:'100%',minHeight:'100vh',fontFamily:'Plus Jakarta Sans,sans-serif',background:T.bg,position:'relative',transition:'background 0.3s',display:'flex',flexDirection:'column'}}>

      {/* Demo Mode Banner */}
      {demoMode&&(
        <div style={{position:'fixed',top:isOffline?40:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:900,background:'linear-gradient(135deg,#c1121f,#ffd60a)',padding:'8px 16px',display:'flex',alignItems:'center',gap:8,zIndex:201}}>
          <span style={{fontSize:16}}>🎬</span>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'#000',fontWeight:700,flex:1}}>DEMO MODE — Auto-cycling screens ({DEMO_SCREENS[demoIdx].toUpperCase()})</span>
          <button onClick={()=>setDemoMode(false)} style={{background:'rgba(0,0,0,0.2)',border:'none',borderRadius:6,padding:'3px 10px',fontSize:11,fontWeight:700,color:'#000',cursor:'pointer'}}>✕ Stop</button>
        </div>
      )}

      {/* PWA Install Banner */}
      {showInstallBanner&&!installed&&(
        <div style={{position:'fixed',top:demoMode?40:0,left:'50%',transform:'translateX(-50%)',
          width:'100%',maxWidth:900,
          background:'linear-gradient(135deg,#0d4f6e,#58c4dc)',
          padding:'10px 16px',display:'flex',alignItems:'center',gap:10,zIndex:202}}>
          <span style={{fontSize:18}}>📱</span>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:11,color:'#fff',fontWeight:700}}>Install VCG App</div>
            <div style={{fontSize:10,color:'rgba(255,255,255,0.7)'}}>Add to home screen for offline access</div>
          </div>
          <button onClick={handleInstall}
            style={{background:'#ffd60a',border:'none',borderRadius:8,
              padding:'6px 14px',fontWeight:800,fontSize:11,color:'#0d1117',cursor:'pointer'}}>
            Install
          </button>
          <button onClick={()=>setShowInstallBanner(false)}
            style={{background:'none',border:'none',color:'rgba(255,255,255,0.7)',
              fontSize:18,cursor:'pointer',padding:'0 4px'}}>×</button>
        </div>
      )}

      {/* Offline Banner */}
      {isOffline&&(
        <div style={{position:'fixed',top:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:900,background:`linear-gradient(135deg,${T.amber},#d97706)`,padding:'8px 16px',display:'flex',alignItems:'center',gap:8,zIndex:200}}>
          <span style={{fontSize:16}}>📴</span>
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'#000',fontWeight:700}}>OFFLINE MODE — Using cached data</span>
        </div>
      )}

      {/* HEADER */}
      <div style={{position:'relative',zIndex:2,padding:`${isOffline?'44px':'16px'} 20px 72px`,background:darkMode?'linear-gradient(135deg,#0d1117 0%,#1a0a0a 40%,#2d0a0a 70%,#3d1200 100%)':'linear-gradient(135deg,#0d1117 0%,#1a0a0a 60%,#3d1200 100%)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:42,height:42,borderRadius:14,background:'radial-gradient(circle,#58c4dc,#0d4f6e)',border:'2px solid #58c4dc',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,boxShadow:'0 0 16px rgba(88,196,220,0.5)'}}>⚡</div>
            <div>
              <div style={{fontFamily:"'Orbitron',monospace",fontSize:15,fontWeight:900,color:'#fff',letterSpacing:1}}>VCG Portal</div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'#ffd60a',letterSpacing:2}}>MI6228 · GROUP 13</div>
            </div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            {/* Dark/Light toggle */}
            <button onClick={()=>setDarkMode(p=>!p)} style={{background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:12,padding:'8px 10px',fontSize:16,cursor:'pointer',transition:'all 0.2s'}} title="Toggle theme">
              {darkMode?'☀️':'🌙'}
            </button>
            {/* Notification bell */}
            <button onClick={()=>setShowNotifPanel(p=>!p)} style={{background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.15)',borderRadius:12,padding:'8px 10px',fontSize:16,cursor:'pointer',position:'relative'}}>
              🔔
              {unreadNotifs>0&&<div style={{position:'absolute',top:2,right:2,width:16,height:16,borderRadius:'50%',background:'#e63946',color:'#fff',fontSize:9,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid rgba(13,17,23,0.8)'}}>{unreadNotifs}</div>}
            </button>
            <div style={{display:'flex',alignItems:'center',gap:5,background:'rgba(255,255,255,0.1)',borderRadius:20,padding:'5px 12px',border:'1px solid rgba(255,255,255,0.15)'}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:statusColor}} />
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'#fff',fontWeight:700}}>{isOffline?'Offline':apiOnline===null?'Checking':apiOnline?'Live':'Down'}</span>
            </div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginTop:18}}>
          {[{l:'Generation',v:totalGen,c:'#ffd60a'},{l:'Consumption',v:totalCon,c:'#ff6b6b'},{l:'Net',v:totalNet,c:totalNet>=0?'#ffd60a':'#e63946'}].map(s=>(
            <div key={s.l} style={{background:'rgba(255,255,255,0.08)',borderRadius:14,padding:'12px 8px',textAlign:'center',backdropFilter:'blur(8px)',border:'1px solid rgba(255,214,10,0.15)'}}>
              <AnimatedNumber value={s.v} color={s.c} fontSize={18} />
              <div style={{fontSize:8,color:'rgba(255,255,255,0.5)',fontWeight:700,marginTop:3,textTransform:'uppercase',letterSpacing:0.8}}>{s.l} kW</div>
            </div>
          ))}
        </div>
      </div>

      {/* NOTIFICATION PANEL */}
      {showNotifPanel&&(
        <div style={{position:'fixed',top:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:900,height:'100vh',background:'rgba(0,0,0,0.5)',zIndex:150,backdropFilter:'blur(4px)'}} onClick={()=>setShowNotifPanel(false)}>
          <div style={{position:'absolute',top:0,right:0,width:'85%',height:'100%',background:T.card,boxShadow:'-8px 0 32px rgba(0,0,0,0.3)',overflowY:'auto',padding:20}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div style={{fontFamily:"'Orbitron',monospace",fontSize:14,color:T.red,fontWeight:700}}>🔔 Notifications</div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setNotifications(p=>p.map(n=>({...n,read:true})))} style={{background:'none',border:`1px solid ${T.border}`,borderRadius:8,padding:'5px 10px',fontSize:11,color:T.text2,cursor:'pointer'}}>Mark all read</button>
                <button onClick={()=>setShowNotifPanel(false)} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:T.text2}}>×</button>
              </div>
            </div>
            {notifications.length===0&&<div style={{textAlign:'center',padding:'40px 0',color:T.text3,fontSize:13}}>No notifications yet</div>}
            {notifications.map(n=>{
              const c=n.type==='error'?T.red:n.type==='warning'?T.amber:n.type==='success'?T.green:T.arc
              return (
                <div key={n.id} onClick={()=>setNotifications(p=>p.map(x=>x.id===n.id?{...x,read:true}:x))}
                  style={{padding:'12px 14px',borderRadius:14,border:`1px solid ${c}30`,background:n.read?T.bg:c+'10',marginBottom:8,cursor:'pointer',opacity:n.read?0.6:1}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{fontWeight:700,fontSize:13,color:c}}>{n.title}</span>
                    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3}}>{n.time}</span>
                  </div>
                  <div style={{fontSize:12,color:T.text2,lineHeight:1.5}}>{n.message}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* CONTENT */}
      <div style={{position:'relative',zIndex:1,padding:'0 16px 120px',maxWidth:900,margin:'-44px auto 0',width:'100%',animation:'pageEnter 0.4s ease'}} key={screen}>
        {screen==='home'      && <HomeScreen      T={T} blocks={blocks} onBlockClick={openBlock} apiOnline={apiOnline} apiMsg={apiMsg} alerts={alerts} isOffline={isOffline} onAddCommunity={()=>setScreen('import')} onNavigate={setScreen} onStartDemo={()=>{setDemoMode(true);setScreen('home')}} darkMode={darkMode} onInstall={handleInstall} canInstall={!!installPrompt&&!installed} installed={installed} cardStyle={cardStyle} pill={pill} ironBtn={ironBtn} weatherData={weatherData} />}
        {screen==='block'     && activeBlock && <BlockDetailScreen T={T} block={activeBlock} blocks={blocks} sensors={sensors[activeBlock.id]||[]} evs={evs.filter(e=>e.block===activeBlock.id)} devices={devices.filter(d=>d.block===activeBlock.id)} history={history[activeBlock.id]||[]} onBack={goHome} onRegister={()=>setScreen('register')} onDeviceClick={(d:Device)=>{setActiveDevice(d);setScreen('devices')}} cardStyle={cardStyle} pill={pill} ironBtn={ironBtn} />}
        {screen==='charts'    && <ChartsScreen    T={T} blocks={blocks} history={history} sensors={sensors} cardStyle={cardStyle} darkMode={darkMode} />}
        {screen==='alerts'    && <AlertsScreen    T={T} alerts={alerts} onMarkRead={(id:string)=>setAlerts(p=>p.map(a=>a.id===id?{...a,read:true}:a))} onMarkAll={()=>setAlerts(p=>p.map(a=>({...a,read:true})))} cardStyle={cardStyle} pill={pill} />}
        {screen==='demand'    && <DemandScreen    T={T} blocks={blocks} apiOnline={apiOnline} cardStyle={cardStyle} pill={pill} goldBtn={goldBtn} />}
        {screen==='history'   && <HistoryScreen   T={T} history={history} blocks={blocks} cardStyle={cardStyle} ironBtn={ironBtn} />}
        {screen==='cost'      && <CostScreen      T={T} blocks={blocks} sensors={sensors} cardStyle={cardStyle} />}
        {screen==='devices'   && <DevicesScreen   T={T} devices={devices} blocks={blocks} activeDevice={activeDevice} onDelete={(s:string)=>setDevices(p=>p.filter(d=>d.sfdi!==s))} cardStyle={cardStyle} pill={pill} ironBtn={ironBtn} />}
        {screen==='map'       && <MapScreen       T={T} blocks={blocks} cardStyle={cardStyle} pill={pill} />}
        {screen==='compare'   && <CompareScreen   T={T} blocks={blocks} sensors={sensors} cardStyle={cardStyle} />}
        {screen==='register'  && <RegisterScreen  T={T} blocks={blocks} activeBlock={activeBlock} onBack={()=>setScreen(activeBlock?'block':'home')} apiOnline={apiOnline} onDeviceAdded={addDevice} cardStyle={cardStyle} ironBtn={ironBtn} lbl={lbl} inp={inp} />}
        {screen==='import'    && <ImportScreen    T={T} blocks={blocks} onBack={goHome} onBlocksImported={(bs:Block[])=>{bs.forEach(b=>addBlock(b));goHome()}} onDevicesImported={(ds:Device[])=>{ds.forEach(d=>addDevice(d))}} cardStyle={cardStyle} ironBtn={ironBtn} />}
        {screen==='simulator' && <SimulatorScreen T={T} blocks={blocks} apiOnline={apiOnline} isOffline={isOffline} onDeviceAdded={addDevice} addNotification={addNotification} cardStyle={cardStyle} ironBtn={ironBtn} goldBtn={goldBtn} pill={pill} />}
        {screen==='group12'    && <Group12Screen T={T} onBack={()=>setScreen('settings')} onImport={(b:Block,d:Device[],s:Sensor[])=>{addBlock(b);d.forEach((dev:Device)=>addDevice(dev));setSensors((p:any)=>({...p,[b.id]:s}));setScreen('home');addNotification({title:'✅ Group 12 Imported',message:`${b.name} added with ${d.length} devices`,type:'success'})}} cardStyle={cardStyle} ironBtn={ironBtn} />}
        {screen==='ngsi'       && <NGSIScreen T={T} blocks={blocks} onBlocksImported={(bs:Block[])=>{bs.forEach((b:Block)=>addBlock(b));setScreen('home')}} cardStyle={cardStyle} ironBtn={ironBtn} />}
        {screen==='architecture' && <ArchitectureScreen T={T} blocks={blocks} apiOnline={apiOnline} cardStyle={cardStyle} darkMode={darkMode} />}
        {screen==='report'    && <ReportScreen T={T} blocks={blocks} sensors={sensors} devices={devices} history={history} weatherData={weatherData} cardStyle={cardStyle} ironBtn={ironBtn} />}
        {screen==='fiware'    && <FIWAREScreen    T={T} blocks={blocks} sensors={sensors} apiOnline={apiOnline} isOffline={isOffline} addNotification={addNotification} cardStyle={cardStyle} ironBtn={ironBtn} />}
        {screen==='settings'  && <SettingsScreen  T={T} apiOnline={apiOnline} apiMsg={apiMsg} onRefresh={()=>{checkApi();checkEndpoints()}} onShowQR={()=>setShowQR(true)} onNavigate={setScreen} onStartDemo={()=>{setDemoMode(true);setScreen('home')}} darkMode={darkMode} onInstall={handleInstall} canInstall={!!installPrompt&&!installed} installed={installed} onToggleDark={()=>setDarkMode(p=>!p)} isOffline={isOffline} cardStyle={cardStyle} ironBtn={ironBtn} goldBtn={goldBtn} endpointHealth={endpointHealth} pinLocked={pinLocked} savedPin={savedPin} onPinChange={(pin:string)=>{setSavedPin(pin);if(pin){localStorage.setItem('vcg_pin',pin);localStorage.setItem('vcg_pin_enabled','true');setPinLocked(true)}else{localStorage.removeItem('vcg_pin');localStorage.setItem('vcg_pin_enabled','false');setPinLocked(false)}}} />}
      </div>

      {/* BOTTOM NAV */}
      <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:900,background:darkMode?'rgba(22,27,34,0.97)':'rgba(255,255,255,0.97)',borderTop:`2px solid ${T.red}30`,zIndex:50,boxShadow:'0 -4px 24px rgba(230,57,70,0.15)',backdropFilter:'blur(16px)',padding:'8px 0 18px'}}>
        <div style={{display:'flex',justifyContent:'space-around'}}>
          {NAV.map(t=>(
            <button key={t.id} onClick={()=>{setActiveBlock(null);setScreen(t.id as Screen)}} style={{background:'none',border:'none',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'0 8px',position:'relative'}}>
              <div style={{width:42,height:42,borderRadius:14,background:screen===t.id?'linear-gradient(135deg,#c1121f,#e63946)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,transition:'all 0.2s',boxShadow:screen===t.id?'0 4px 12px rgba(230,57,70,0.5)':undefined}}>
                {t.icon}
              </div>
              {(t as any).badge>0&&<div style={{position:'absolute',top:0,right:6,width:16,height:16,borderRadius:'50%',background:T.red,color:'#fff',fontSize:9,fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',border:`2px solid ${T.bg}`}}>{(t as any).badge}</div>}
              <span style={{fontSize:10,fontWeight:700,color:screen===t.id?T.red:T.text3}}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* QR MODAL */}
      {showQR&&(
        <div style={{position:'fixed',inset:0,background:'rgba(13,17,23,0.9)',backdropFilter:'blur(12px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:24}} onClick={()=>setShowQR(false)}>
          <div style={{background:T.card,borderRadius:28,padding:32,textAlign:'center',maxWidth:300,width:'100%'}} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:18,color:T.red,marginBottom:4}}>Share VCG</div>
            <div style={{display:'inline-block',border:`3px solid ${T.red}`,borderRadius:18,padding:10,margin:'16px 0',boxShadow:`0 0 24px ${T.red}40`}}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(APP_URL)}&color=c1121f&bgcolor=ffffff&qzone=1`} width={200} height={200} alt="QR" style={{borderRadius:10,display:'block'}} />
            </div>
            <div style={{background:T.bg,borderRadius:12,padding:'10px 14px',display:'flex',alignItems:'center',gap:8,marginBottom:16,border:`1px solid ${T.border}`}}>
              <span>🌐</span><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:T.text,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{APP_URL}</span>
              <button onClick={()=>{navigator.clipboard.writeText(APP_URL);setCopied(true);setTimeout(()=>setCopied(false),2000)}} style={{background:'none',border:'none',cursor:'pointer',fontSize:16}}>{copied?'✅':'📋'}</button>
            </div>
            <button onClick={()=>setShowQR(false)} style={ironBtn()}>Done</button>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes countPop{0%{transform:scale(1.2);opacity:0.7}100%{transform:scale(1);opacity:1}} @keyframes pageEnter{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}} @keyframes barGrow{from{height:0;opacity:0}to{opacity:1}} @keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </div>
  )
}

// ── CIRCULAR GAUGE ────────────────────────────────────────────────────────────
function CircularGauge({value,max,label,unit,color,size=90}:{value:number;max:number;label:string;unit:string;color:string;size?:number}) {
  const pct=Math.min(value/max,1)
  const r=(size/2)-8
  const circ=2*Math.PI*r
  const dash=circ*pct
  const gap=circ-dash
  const cx=size/2, cy=size/2
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
      <div style={{position:'relative',width:size,height:size}}>
        <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
          {/* Track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6}/>
          {/* Progress */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={6}
            strokeLinecap="round" strokeDasharray={`${dash} ${gap}`}
            style={{transition:'stroke-dasharray 1s ease',filter:`drop-shadow(0 0 4px ${color}80)`}}/>
        </svg>
        <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
          <div style={{fontFamily:"'Orbitron',monospace",fontSize:size*0.18,fontWeight:700,color,lineHeight:1}}>{value}</div>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:size*0.1,color:'rgba(255,255,255,0.5)',marginTop:2}}>{unit}</div>
        </div>
      </div>
      <div style={{fontSize:10,color:'rgba(255,255,255,0.6)',fontWeight:600,textAlign:'center',maxWidth:size}}>{label}</div>
    </div>
  )
}

// ── ENERGY FLOW ANIMATION ─────────────────────────────────────────────────────
function EnergyFlow({blocks,T}:{blocks:any[];T:any}) {
  const surplus=blocks.filter((b:any)=>b.status==='Surplus')
  const deficit=blocks.filter((b:any)=>b.status==='Deficit')
  if(!surplus.length||!deficit.length) return null

  // Layout constants - each block card is 110w x 44h with 12px gap
  const CARD_W=110, CARD_H=44, GAP=14
  const leftX=0, rightX=230
  const centerX=170, centerY=Math.max(surplus.length,deficit.length)*(CARD_H+GAP)/2
  const totalH=Math.max(surplus.length,deficit.length)*(CARD_H+GAP)+20
  const viewH=Math.max(totalH,140)

  const blockY=(i:number,total:number)=>{
    const totalBlock=total*(CARD_H+GAP)-GAP
    const startY=(viewH-totalBlock)/2
    return startY+i*(CARD_H+GAP)
  }

  return (
    <div style={{background:'rgba(13,17,23,0.9)',borderRadius:20,padding:20,
      border:'1px solid rgba(255,214,10,0.2)',
      boxShadow:'0 8px 32px rgba(230,57,70,0.1)'}}>
      <div style={{fontWeight:800,fontSize:14,color:'#fff',marginBottom:16,
        display:'flex',alignItems:'center',gap:8}}>
        <span style={{color:'#ffd60a',fontSize:18}}>⚡</span>
        <span style={{fontFamily:"'Orbitron',monospace",letterSpacing:1}}>Live Energy Flow</span>
        <div style={{marginLeft:'auto',fontFamily:"'Share Tech Mono',monospace",
          fontSize:10,color:'rgba(255,214,10,0.5)'}}>Real-time transfer</div>
      </div>

      <svg width="100%" viewBox={`0 0 340 ${viewH}`}
        style={{display:'block',overflow:'visible'}}>
        <defs>
          <marker id="fwdArrow" viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="6" markerHeight="6" orient="auto">
            <path d="M2 1L8 5L2 9" fill="none" stroke="#ffd60a"
              strokeWidth="1.8" strokeLinecap="round"/>
          </marker>
          <marker id="defArrow" viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="6" markerHeight="6" orient="auto">
            <path d="M2 1L8 5L2 9" fill="none" stroke="#e63946"
              strokeWidth="1.8" strokeLinecap="round"/>
          </marker>
          {surplus.map((_:any,i:number)=>(
            <linearGradient key={i} id={`lg${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#e63946" stopOpacity="0.9"/>
              <stop offset="100%" stopColor="#ffd60a" stopOpacity="0.9"/>
            </linearGradient>
          ))}
        </defs>

        {/* ── SURPLUS BLOCKS (left) ── */}
        {surplus.slice(0,4).map((b:any,i:number)=>{
          const y=blockY(i,Math.min(surplus.length,4))
          const midY=y+CARD_H/2
          return (
            <g key={b.id}>
              {/* Card background */}
              <rect x={leftX} y={y} width={CARD_W} height={CARD_H} rx={10}
                fill={b.color+'15'} stroke={b.color} strokeWidth={1.5}/>
              {/* Block name - inside card top half */}
              <text x={leftX+CARD_W/2} y={y+17} textAnchor="middle"
                fontSize="11" fontWeight="700" fill={b.color}
                fontFamily="Plus Jakarta Sans,sans-serif">{b.name}</text>
              {/* kW value - inside card bottom half */}
              <text x={leftX+CARD_W/2} y={y+33} textAnchor="middle"
                fontSize="10" fontWeight="700" fill="#ffd60a"
                fontFamily="'Share Tech Mono',monospace">
                +{b.net.toFixed(1)} kW
              </text>
              {/* Connector dot */}
              <circle cx={leftX+CARD_W+2} cy={midY} r={4}
                fill="#ffd60a" stroke="#0d1117" strokeWidth={1.5}/>
              {/* Flow line to center */}
              <path d={`M${leftX+CARD_W+6} ${midY} C${centerX-40} ${midY} ${centerX-40} ${centerY} ${centerX-22} ${centerY}`}
                fill="none" stroke={`url(#lg${i})`} strokeWidth={2}
                markerEnd="url(#fwdArrow)"/>
              {/* Animated dot on path */}
              <circle r={3.5} fill="#ffd60a" opacity={0.9}>
                <animateMotion dur={`${1.4+i*0.25}s`} repeatCount="indefinite">
                  <mpath href={`#sp${i}`}/>
                </animateMotion>
              </circle>
              <path id={`sp${i}`}
                d={`M${leftX+CARD_W+6} ${midY} C${centerX-40} ${midY} ${centerX-40} ${centerY} ${centerX-22} ${centerY}`}
                fill="none"/>
            </g>
          )
        })}

        {/* ── CENTER HUB ── */}
        {/* Outer glow ring */}
        <circle cx={centerX} cy={centerY} r={28}
          fill="none" stroke="rgba(255,214,10,0.15)" strokeWidth={8}/>
        {/* Gold ring */}
        <circle cx={centerX} cy={centerY} r={24}
          fill="#0d1117" stroke="#ffd60a" strokeWidth={2}/>
        {/* Spinning arc reactor ring */}
        <circle cx={centerX} cy={centerY} r={17}
          fill="none" stroke="#e63946" strokeWidth={1.5}
          strokeDasharray="6,3">
          <animateTransform attributeName="transform" type="rotate"
            from={`0 ${centerX} ${centerY}`} to={`360 ${centerX} ${centerY}`}
            dur="3s" repeatCount="indefinite"/>
        </circle>
        {/* Inner blue ring */}
        <circle cx={centerX} cy={centerY} r={11}
          fill="none" stroke="#58c4dc" strokeWidth={1}
          strokeDasharray="3,2">
          <animateTransform attributeName="transform" type="rotate"
            from={`360 ${centerX} ${centerY}`} to={`0 ${centerX} ${centerY}`}
            dur="5s" repeatCount="indefinite"/>
        </circle>
        {/* Center fill */}
        <circle cx={centerX} cy={centerY} r={9}
          fill="radial-gradient(circle,#58c4dc,#0d4f6e)"/>
        <circle cx={centerX} cy={centerY} r={9} fill="#0d1117"/>
        <text x={centerX} y={centerY-3} textAnchor="middle" fontSize="7"
          fill="#ffd60a" fontFamily="'Orbitron',monospace" fontWeight="700">VCG</text>
        <text x={centerX} y={centerY+7} textAnchor="middle" fontSize="6"
          fill="rgba(88,196,220,0.8)" fontFamily="'Share Tech Mono',monospace">GRID</text>

        {/* ── DEFICIT BLOCKS (right) ── */}
        {deficit.slice(0,4).map((b:any,i:number)=>{
          const y=blockY(i,Math.min(deficit.length,4))
          const midY=y+CARD_H/2
          return (
            <g key={b.id}>
              {/* Flow line from center */}
              <path d={`M${centerX+22} ${centerY} C${centerX+40} ${centerY} ${centerX+40} ${midY} ${rightX-2} ${midY}`}
                fill="none" stroke="#e63946" strokeWidth={1.8}
                strokeDasharray="5,3" markerEnd="url(#defArrow)" opacity={0.85}/>
              {/* Card background */}
              <rect x={rightX} y={y} width={CARD_W} height={CARD_H} rx={10}
                fill={b.color+'15'} stroke={b.color} strokeWidth={1.5}/>
              {/* Block name */}
              <text x={rightX+CARD_W/2} y={y+17} textAnchor="middle"
                fontSize="11" fontWeight="700" fill={b.color}
                fontFamily="Plus Jakarta Sans,sans-serif">{b.name}</text>
              {/* kW value - inside card */}
              <text x={rightX+CARD_W/2} y={y+33} textAnchor="middle"
                fontSize="10" fontWeight="700" fill="#e63946"
                fontFamily="'Share Tech Mono',monospace">
                {b.net.toFixed(1)} kW
              </text>
            </g>
          )
        })}
      </svg>

      {/* Legend */}
      <div style={{display:'flex',gap:20,justifyContent:'center',marginTop:12,
        paddingTop:12,borderTop:'1px solid rgba(255,255,255,0.06)'}}>
        {[
          {c:'#ffd60a',l:`${Math.min(surplus.length,4)} Surplus → VCG`},
          {c:'#e63946',l:`VCG → ${Math.min(deficit.length,4)} Deficit`},
        ].map(x=>(
          <div key={x.l} style={{display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:12,height:12,borderRadius:2,background:x.c}}/>
            <span style={{fontSize:11,color:'rgba(255,255,255,0.6)',fontWeight:600}}>{x.l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}


// ── ANIMATED NUMBER COUNTER ──────────────────────────────────────────────────
function AnimatedNumber({value,decimals=1,color,fontSize=18,suffix=''}:{value:number;decimals?:number;color:string;fontSize?:number;suffix?:string}) {
  const [display,setDisplay]=useState(0)
  const [key,setKey]=useState(0)
  const prevRef=useRef(0)

  useEffect(()=>{
    const start=prevRef.current
    const end=value
    const diff=end-start
    if(Math.abs(diff)<0.01){setDisplay(value);return}
    const steps=20
    const stepTime=600/steps
    let step=0
    const timer=setInterval(()=>{
      step++
      const progress=step/steps
      const eased=1-Math.pow(1-progress,3)
      setDisplay(+(start+diff*eased).toFixed(decimals))
      if(step>=steps){setDisplay(end);prevRef.current=end;clearInterval(timer)}
    },stepTime)
    return ()=>clearInterval(timer)
  },[value])

  return (
    <span style={{fontFamily:"'Orbitron',monospace",fontSize,fontWeight:700,color,
      animation:'countPop 0.3s ease',display:'inline-block'}}>
      {display.toFixed(decimals)}{suffix}
    </span>
  )
}

// ── CHART COMPONENTS ──────────────────────────────────────────────────────────
function BarChart({data,colors,height=140,T}:{data:{label:string;values:number[];colors?:string[]}[];colors:string[];height?:number;T:any}) {
  const allVals=data.flatMap(d=>d.values), maxV=Math.max(...allVals,1)
  return (
    <div style={{overflowX:'auto'}}>
      <div style={{display:'flex',gap:4,alignItems:'flex-end',minWidth:data.length*48,padding:'20px 4px 0'}}>
        {data.map((d,i)=>(
          <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',minWidth:40}}>
            <div style={{display:'flex',gap:2,alignItems:'flex-end',width:'100%',height:height}}>
              {d.values.map((v,j)=>{
                const h=Math.max((v/maxV)*height,4)
                return (
                  <div key={j} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',height}}>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:colors[j]||'#e63946',fontWeight:700,marginBottom:2,whiteSpace:'nowrap'}}>{v}</div>
                    <div style={{width:'100%',height:h,background:`linear-gradient(180deg,${colors[j]||'#e63946'},${colors[j]||'#e63946'}70)`,borderRadius:'4px 4px 0 0'}} />
                  </div>
                )
              })}
            </div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:T.text3,textAlign:'center',marginTop:4}}>{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LineChart({data,color='#e63946',height=120,T}:{data:number[];color?:string;height?:number;T:any}) {
  if(data.length<2) return null
  const maxV=Math.max(...data,1),minV=Math.min(...data,0),range=maxV-minV||1
  const W=320,H=height
  const pts=data.map((v,i)=>({x:(i/(data.length-1))*W,y:H-((v-minV)/range)*(H-28)-4}))
  const pathD=pts.map((p,i)=>i===0?`M${p.x},${p.y}`:`L${p.x},${p.y}`).join(' ')
  return (
    <div style={{overflowX:'auto'}}>
      <svg width="100%" viewBox={`0 0 ${W} ${H+10}`} style={{display:'block',minWidth:260}}>
        <defs><linearGradient id={`lg${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3"/><stop offset="100%" stopColor={color} stopOpacity="0.02"/></linearGradient></defs>
        {[0.25,0.5,0.75].map(f=><line key={f} x1={0} y1={H*f} x2={W} y2={H*f} stroke={T.border} strokeWidth="0.5" strokeDasharray="4,4"/>)}
        <path d={`${pathD} L${W},${H} L0,${H} Z`} fill={`url(#lg${color.replace('#','')})`}/>
        <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map((p,i)=>(
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill={color} stroke="#fff" strokeWidth="1.5"/>
            {(i%Math.ceil(data.length/5)===0||i===data.length-1)&&<text x={p.x} y={p.y-9} textAnchor="middle" fontSize="8" fill={color} fontFamily="Share Tech Mono,monospace" fontWeight="700">{data[i]}</text>}
          </g>
        ))}
      </svg>
    </div>
  )
}

function DonutChart({segments,size=160,T}:{segments:{label:string;value:number;color:string}[];size?:number;T:any}) {
  const total=segments.reduce((s,x)=>s+x.value,0)||1
  const cx=size/2,cy=size/2,r=size*0.35,inner=size*0.22
  let angle=-Math.PI/2
  const arcs=segments.map(s=>{
    const sweep=(s.value/total)*2*Math.PI
    const x1=cx+r*Math.cos(angle),y1=cy+r*Math.sin(angle)
    angle+=sweep
    const x2=cx+r*Math.cos(angle),y2=cy+r*Math.sin(angle)
    const large=sweep>Math.PI?1:0
    const ma=angle-sweep/2
    return {x1,y1,x2,y2,large,color:s.color,label:s.label,value:s.value,pct:Math.round(s.value/total*100),lx:cx+(r+18)*Math.cos(ma),ly:cy+(r+18)*Math.sin(ma),ia:angle-sweep}
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{display:'block',margin:'0 auto',overflow:'visible'}}>
      {arcs.map((a,i)=>(
        <g key={i}>
          <path d={`M${cx+inner*Math.cos(a.ia)} ${cy+inner*Math.sin(a.ia)} L${a.x1} ${a.y1} A${r} ${r} 0 ${a.large} 1 ${a.x2} ${a.y2} L${cx+inner*Math.cos(angle-((segments[i].value/total)*2*Math.PI)+(segments[i].value/total)*2*Math.PI)} ${cy+inner*Math.sin(angle-((segments[i].value/total)*2*Math.PI)+(segments[i].value/total)*2*Math.PI)} A${inner} ${inner} 0 ${a.large} 0 ${cx+inner*Math.cos(a.ia)} ${cy+inner*Math.sin(a.ia)} Z`}
            fill={a.color} stroke={T.card} strokeWidth="2"/>
          {a.pct>5&&<text x={a.lx} y={a.ly} textAnchor="middle" dominantBaseline="middle" fontSize="8" fill={a.color} fontWeight="700" fontFamily="Share Tech Mono,monospace">{a.pct}%</text>}
        </g>
      ))}
      <circle cx={cx} cy={cy} r={inner} fill={T.card}/>
      <text x={cx} y={cy-6} textAnchor="middle" fontSize="11" fill={T.text} fontWeight="700" fontFamily="Orbitron,monospace">{total.toFixed(0)}</text>
      <text x={cx} y={cy+8} textAnchor="middle" fontSize="8" fill={T.text3} fontFamily="Share Tech Mono,monospace">kW</text>
    </svg>
  )
}

function HBarChart({data,T}:{data:{label:string;value:number;max:number;color:string}[];T:any}) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {data.map((d,i)=>(
        <div key={i}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
            <span style={{fontSize:12,color:T.text2,fontWeight:600}}>{d.label}</span>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:d.color,fontWeight:700}}>{d.value.toFixed(1)} kW</span>
          </div>
          <div style={{height:10,background:T.bg,borderRadius:5,overflow:'visible',position:'relative'}}>
            <div style={{height:'100%',width:`${Math.min((d.value/d.max)*100,100)}%`,background:`linear-gradient(90deg,${d.color}80,${d.color})`,borderRadius:5,transition:'width 1s ease',position:'relative'}}>
              <div style={{position:'absolute',right:-2,top:'50%',transform:'translateY(-50%)',width:14,height:14,borderRadius:'50%',background:d.color,border:'2px solid #fff',boxShadow:`0 0 6px ${d.color}`}} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── HOME ──────────────────────────────────────────────────────────────────────
function HomeScreen({T,blocks,onBlockClick,apiOnline,apiMsg,alerts,isOffline,onAddCommunity,onNavigate,darkMode,cardStyle,pill,ironBtn,weatherData}:any) {
  const unread=alerts.filter((a:Alert)=>!a.read).length
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      {!isOffline&&apiOnline&&apiMsg&&<div style={{background:T.greenL,border:`1px solid ${T.green}40`,borderRadius:16,padding:'10px 14px',display:'flex',alignItems:'center',gap:8}}><span>✅</span><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:T.green}}>{apiMsg}</span></div>}
      {unread>0&&<div onClick={()=>onNavigate('alerts')} style={{background:`${T.red}12`,border:`1.5px solid ${T.red}40`,borderRadius:16,padding:'14px 16px',display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
        <div style={{width:40,height:40,borderRadius:12,background:`linear-gradient(135deg,#c1121f,#e63946)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,boxShadow:`0 4px 12px ${T.red}40`}}>⚠️</div>
        <div style={{flex:1}}><div style={{fontWeight:800,fontSize:13,color:T.red}}>{unread} Active Alert{unread>1?'s':''}</div><div style={{fontSize:11,color:T.text2}}>Tap to view</div></div>
        <span style={{fontSize:18,color:T.red}}>›</span>
      </div>}
      {/* Weather Strip */}
      {Object.keys(weatherData).length>0&&(
        <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(Object.keys(weatherData).length,4)},1fr)`,gap:8}}>
          {Object.values(weatherData).slice(0,4).map((w:any)=>(
            <div key={w.city} style={{background:darkMode?'rgba(19,24,31,0.9)':'rgba(255,255,255,0.9)',borderRadius:14,padding:'10px 8px',textAlign:'center',border:darkMode?'1px solid rgba(255,214,10,0.12)':undefined,backdropFilter:'blur(12px)'}}>
              <img src={`https://openweathermap.org/img/wn/${w.icon}.png`} width={32} height={32} alt={w.desc} style={{display:'block',margin:'0 auto'}}/>
              <div style={{fontFamily:"'Orbitron',monospace",fontSize:13,fontWeight:700,color:T.gold,lineHeight:1}}>{w.temp}°</div>
              <div style={{fontSize:9,color:T.text3,marginTop:2,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5}}>{w.city}</div>
              <div style={{display:'flex',justifyContent:'center',gap:6,marginTop:4}}>
                <span style={{fontSize:9,color:T.text2}}>💨{w.windSpeed}km/h</span>
                <span style={{fontSize:9,color:T.text2}}>💧{w.humidity}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Energy Flow Animation */}
      <EnergyFlow blocks={blocks} T={T} />

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontWeight:900,fontSize:17,color:T.text}}>Energy Communities</div><div style={{fontSize:12,color:T.text2,marginTop:1}}>{blocks.length} blocks · tap to explore</div></div>
        <button onClick={onAddCommunity} style={ironBtn({width:'auto',padding:'9px 16px',fontSize:12})}>＋ Add</button>
      </div>
      {blocks.map((b:Block,i:number)=>(
        <div key={b.id} onClick={()=>onBlockClick(b)} style={{...cardStyle(),cursor:'pointer',transition:'all 0.2s',borderLeft:`4px solid ${b.color}`}}
          onMouseOver={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow=`0 8px 28px ${b.color}25`}}
          onMouseOut={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow=''}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
            <div style={{display:'flex',gap:12,alignItems:'center'}}>
              <div style={{width:48,height:48,borderRadius:16,background:`${b.color}20`,border:`2px solid ${b.color}60`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24}}>{b.emoji}</div>
              <div><div style={{fontWeight:800,fontSize:16,color:T.text}}>{b.name} — {b.location}</div><div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3,marginTop:2}}>{b.id} · {b.devices} devices</div></div>
            </div>
            <div style={pill(b.status==='Surplus'?T.green:b.status==='Deficit'?T.red:T.arc)}>{b.status}</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            {[{l:'Gen kW',v:b.generation.toFixed(1),c:T.green},{l:'Con kW',v:b.consumption.toFixed(1),c:T.amber},{l:'Net kW',v:(b.net>=0?'+':'')+b.net.toFixed(1),c:b.status==='Surplus'?T.green:b.status==='Deficit'?T.red:T.arc}].map(s=>(
              <div key={s.l} style={{background:T.bg,borderRadius:12,padding:'10px 6px',textAlign:'center',border:`1px solid ${T.border}`}}>
                <div style={{fontFamily:"'Orbitron',monospace",fontSize:17,fontWeight:700,color:s.c,lineHeight:1}}>{s.v}</div>
                <div style={{fontSize:9,color:T.text3,fontWeight:700,marginTop:3}}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── CHARTS ────────────────────────────────────────────────────────────────────
function ChartsScreen({T,blocks,history,sensors,cardStyle,darkMode}:any) {
  const [selBlock,setSelBlock]=useState('ALL')
  const recentH=selBlock==='ALL'?(history['BLK-A']||[]).slice(-8):(history[selBlock]||[]).slice(-8)
  const genData=recentH.map((h:HistoryEntry)=>+h.generation)
  const conData=recentH.map((h:HistoryEntry)=>+h.consumption)
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{...cardStyle({background:darkMode?'linear-gradient(135deg,#0d1117,#161b22)':'linear-gradient(135deg,#0d1117,#1a0a0a)',border:'none'})}}>
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:'#ffd60a'}}>📈 Live Charts</div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'rgba(255,255,255,0.5)',marginTop:4}}>Real-time energy visualization</div>
      </div>
      <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:4}}>
        {['ALL',...blocks.map((b:Block)=>b.id)].map((id:string)=>{const b=blocks.find((x:Block)=>x.id===id);return <button key={id} onClick={()=>setSelBlock(id)} style={{flexShrink:0,padding:'6px 14px',borderRadius:20,border:`2px solid ${selBlock===id?(b?.color||T.arc):T.border}`,background:selBlock===id?(b?.color||T.arc)+'20':T.card,fontWeight:700,fontSize:11,color:selBlock===id?(b?.color||T.arc):T.text3,cursor:'pointer',whiteSpace:'nowrap'}}>{id==='ALL'?'All':b?.name||id}</button>})}
      </div>
      <div style={cardStyle()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:800,fontSize:14,color:T.text}}>Generation vs Consumption (kW)</div>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3}}>{new Date().toLocaleTimeString()}</div>
        </div>
        <BarChart data={recentH.map((h:HistoryEntry)=>({label:h.time,values:[+h.generation,+h.consumption]}))} colors={[T.green,T.red]} height={130} T={T}/>
        <div style={{display:'flex',gap:20,justifyContent:'center',marginTop:12}}>
          {[{c:T.green,l:'Generation'},{c:T.red,l:'Consumption'}].map(x=>(
            <div key={x.l} style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{width:14,height:14,borderRadius:3,background:x.c}}/>
              <span style={{fontSize:12,color:T.text2,fontWeight:600}}>{x.l}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={cardStyle()}>
        <div style={{fontWeight:800,fontSize:14,color:T.text,marginBottom:14}}>Block Efficiency</div>
        {blocks.map((b:Block)=>{const eff=b.generation>0?Math.round((b.net/b.generation)*100):0;return(
          <div key={b.id} style={{marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}><span style={{fontSize:16}}>{b.emoji}</span><span style={{fontWeight:700,fontSize:13,color:T.text}}>{b.name}</span></div>
              <div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:b.color,fontWeight:700}}>{b.generation.toFixed(1)} kW</span><span style={{fontWeight:800,fontSize:12,color:eff>=0?T.green:T.red}}>{eff>=0?'+':''}{eff}%</span></div>
            </div>
            <div style={{height:8,background:T.bg,borderRadius:4,overflow:'hidden'}}><div style={{height:'100%',width:`${Math.min(Math.abs(eff),100)}%`,background:eff>=0?`linear-gradient(90deg,${T.green},${b.color})`:`linear-gradient(90deg,${T.red},#c1121f)`,borderRadius:4,transition:'width 1s ease'}}/></div>
          </div>
        )})}
      </div>
    </div>
  )
}

// ── BLOCK DETAIL ──────────────────────────────────────────────────────────────
function BlockDetailScreen({T,block:b,blocks,sensors,evs,devices,history,onBack,onRegister,onDeviceClick,cardStyle,pill,ironBtn}:any) {
  const live=blocks.find((x:Block)=>x.id===b.id)||b
  const sc=live.status==='Surplus'?T.green:live.status==='Deficit'?T.red:T.arc
  const recentH=(history||[]).slice(-6)
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{background:T.card,borderRadius:20,overflow:'hidden',boxShadow:'0 4px 16px rgba(0,0,0,0.12)'}}>
        <div style={{background:`linear-gradient(135deg,#0d1117,${b.color}cc)`,padding:'18px 20px'}}>
          <button onClick={onBack} style={{background:'rgba(255,255,255,0.15)',border:'none',borderRadius:10,padding:'6px 14px',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',marginBottom:14}}>← Back</button>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{display:'flex',gap:12,alignItems:'center'}}><span style={{fontSize:36}}>{b.emoji}</span><div><div style={{fontFamily:"'Orbitron',monospace",fontSize:18,fontWeight:900,color:'#fff'}}>{b.name}</div><div style={{fontSize:12,color:'rgba(255,255,255,0.7)'}}>{b.location} · {b.id}</div></div></div>
            <div style={{textAlign:'right'}}><div style={{fontFamily:"'Orbitron',monospace",fontSize:26,fontWeight:900,color:live.net>=0?'#ffd60a':'#e63946'}}>{(live.net>=0?'+':'')+live.net.toFixed(1)}</div><div style={{fontSize:10,color:'rgba(255,255,255,0.6)',fontWeight:700}}>kW Net</div></div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',padding:'16px',gap:8,background:T.card}}>
          {[{l:'Generation',v:live.generation.toFixed(1),c:T.green},{l:'Consumption',v:live.consumption.toFixed(1),c:T.amber},{l:'Status',v:live.status,c:sc}].map(s=>(
            <div key={s.l} style={{textAlign:'center'}}><div style={{fontFamily:"'Orbitron',monospace",fontSize:18,fontWeight:700,color:s.c}}>{s.v}</div><div style={{fontSize:10,color:T.text3,marginTop:2}}>{s.l}{s.l!=='Status'?' kW':''}</div></div>
          ))}
        </div>
      </div>
      {recentH.length>0&&<><SH T={T} title="Energy Trend" /><div style={cardStyle({padding:'14px 10px'})}><BarChart data={recentH.map((h:HistoryEntry)=>({label:h.time,values:[+h.generation,+h.consumption]}))} colors={[T.green,T.red]} height={90} T={T}/></div></>}
      <SH T={T} title="Sensor Parameters" />
      {/* Circular gauges for key sensors */}
      <div style={cardStyle({})}>
        <div style={{fontWeight:700,fontSize:12,color:T.text2,marginBottom:16,fontFamily:"'Share Tech Mono',monospace",letterSpacing:1,textTransform:'uppercase'}}>Key Metrics</div>
        <div style={{display:'flex',justifyContent:'space-around',flexWrap:'wrap',gap:12}}>
          {sensors.slice(0,4).map((s:Sensor)=>(
            <CircularGauge key={s.label} value={+s.value} max={s.label==='Temperature'?50:s.label==='Solar Irradiance'?1000:s.label==='Battery SOC'?100:10} label={s.label} unit={s.unit} color={s.color} size={88}/>
          ))}
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {sensors.map((s:Sensor,i:number)=>(
          <div key={s.label} style={cardStyle({padding:'14px 16px'})}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}><span style={{fontSize:20}}>{s.icon}</span><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3,background:T.bg,padding:'2px 7px',borderRadius:6}}>{s.unit}</span></div>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:24,fontWeight:700,color:s.color,lineHeight:1,marginBottom:4}}>{s.value}</div>
            <div style={{fontSize:11,color:T.text2,marginBottom:8}}>{s.label}</div>
            <div style={{height:3,background:T.bg,borderRadius:2,overflow:'hidden'}}><div style={{height:'100%',width:Math.min(s.bar,100)+'%',background:`linear-gradient(90deg,${s.color}60,${s.color})`,borderRadius:2}}/></div>
          </div>
        ))}
      </div>
      {evs.length>0&&<><SH T={T} title="EV Charging" />{evs.map((ev:EV)=>(
        <div key={ev.id} style={cardStyle({border:`1.5px solid ${ev.status==='CHARGING'?T.gold:T.border}`})}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}><div style={{display:'flex',gap:10,alignItems:'center'}}><span style={{fontSize:24}}>🚗</span><div style={{fontWeight:800,fontSize:15,color:T.text}}>{ev.id}</div></div><div style={pill(ev.status==='CHARGING'?T.gold:T.text3)}>{ev.status}</div></div>
          {[{l:'Power',v:ev.power+' kW'},{l:'Time',v:ev.sessionTime+' min'},{l:'SOC',v:ev.soc+'%'}].map(r=><div key={r.l} style={{display:'flex',justifyContent:'space-between',marginBottom:8}}><span style={{fontSize:12,color:T.text2}}>{r.l}</span><span style={{fontWeight:800,fontSize:12,color:T.text}}>{r.v}</span></div>)}
          <div style={{height:4,background:T.bg,borderRadius:2,overflow:'hidden',marginTop:8}}><div style={{height:'100%',width:ev.soc+'%',background:ev.status==='CHARGING'?`linear-gradient(90deg,${T.gold},${T.amber})`:`linear-gradient(90deg,${T.arc},#0891b2)`,borderRadius:2}}/></div>
        </div>
      ))}</>}
      <SH T={T} title={`Devices (${devices.length})`} />
      <div style={cardStyle({padding:16})}>
        {devices.length===0?<div style={{textAlign:'center',padding:'16px 0'}}><div style={{fontSize:32,marginBottom:8}}>📭</div><div style={{fontSize:13,color:T.text2}}>No devices</div></div>:(
          <div style={{display:'flex',flexDirection:'column',gap:8}}>{devices.map((d:Device,i:number)=>(
            <div key={i} onClick={()=>onDeviceClick(d)} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',background:T.bg,borderRadius:12,border:`1px solid ${T.border}`,cursor:'pointer',transition:'all 0.15s'}}
              onMouseOver={e=>{e.currentTarget.style.borderColor=T.arc+'50'}} onMouseOut={e=>{e.currentTarget.style.borderColor=T.border}}>
              <div style={{width:36,height:36,borderRadius:10,background:T.arcLight,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>📟</div>
              <div style={{flex:1}}><div style={{fontFamily:"'Share Tech Mono',monospace",fontWeight:700,fontSize:12,color:T.arc}}>{d.sfdi}</div><div style={{fontSize:11,color:T.text3}}>{d.type}</div></div>
              <div style={pill(d.status==='Online'?T.green:T.amber)}>{d.status}</div>
            </div>
          ))}</div>
        )}
      </div>
      <button onClick={onRegister} style={ironBtn()}>➕ Register Device to {b.name}</button>
    </div>
  )
}

// ── 7. DEVICE SIMULATOR ───────────────────────────────────────────────────────
function SimulatorScreen({T,blocks,apiOnline,isOffline,onDeviceAdded,addNotification,cardStyle,ironBtn,goldBtn,pill}:any) {
  const [selBlock,setSelBlock]=useState('BLK-A')
  const [selType,setSelType]=useState('Smart Meter')
  const [running,setRunning]=useState(false)
  const [readings,setReadings]=useState<SimReading[]>([])
  const [interval,setIntervalSec]=useState(3)
  const [sendCount,setSendCount]=useState(0)
  const timerRef=useRef<any>(null)

  const DEVICE_TYPES=[
    {type:'Smart Meter',     icon:'📟',power:[800,2000],  voltage:230,tempRange:[18,25]},
    {type:'Solar Inverter',  icon:'☀️',power:[1000,5000], voltage:230,tempRange:[20,35]},
    {type:'EV Charger',      icon:'🚗',power:[3700,11000],voltage:230,tempRange:[20,30]},
    {type:'Wind Turbine',    icon:'💨',power:[2000,8000], voltage:400,tempRange:[15,25]},
    {type:'Battery Storage', icon:'🔋',power:[1000,5000], voltage:48, tempRange:[20,30]},
    {type:'HVAC Unit',       icon:'❄️',power:[500,3000],  voltage:230,tempRange:[18,22]},
  ]

  const generateReading=():SimReading=>{
    const dt=DEVICE_TYPES.find(d=>d.type===selType)||DEVICE_TYPES[0]
    const power=+(dt.power[0]+Math.random()*(dt.power[1]-dt.power[0])).toFixed(0)
    const temp=+(dt.tempRange[0]+Math.random()*(dt.tempRange[1]-dt.tempRange[0])).toFixed(1)
    return {
      deviceId:`${selType.replace(/ /g,'-').toUpperCase()}-${selBlock}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
      type:selType, block:selBlock, power, voltage:dt.voltage, temperature:temp,
      timestamp:new Date().toISOString(), sent:false
    }
  }

  const sendReading=async(reading:SimReading):Promise<boolean>=>{
    if(isOffline) return false
    try {
      const r=await fetch(API_V1+'/edev',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sfdi:reading.deviceId,lfdi:'LFDI-'+reading.deviceId,deviceType:reading.type,block:reading.block,realPower:reading.power,voltage:reading.voltage,temperature:reading.temperature})})
      return r.ok
    } catch { return false }
  }

  const startSimulation=()=>{
    setRunning(true)
    addNotification({title:'🤖 Simulator Started',message:`Simulating ${selType} in ${selBlock} every ${interval}s`,type:'info'})
    timerRef.current=setInterval(async()=>{
      const reading=generateReading()
      const sent=await sendReading(reading)
      setReadings(p=>[{...reading,sent},...p].slice(0,20))
      setSendCount(p=>p+1)
      if(sent) addNotification({title:`📡 Reading Sent`,message:`${reading.type}: ${reading.power}W @ ${reading.voltage}V`,type:'success'})
    },interval*1000)
  }

  const stopSimulation=()=>{
    setRunning(false)
    if(timerRef.current) clearInterval(timerRef.current)
    addNotification({title:'🛑 Simulator Stopped',message:`Sent ${sendCount} readings total`,type:'info'})
  }

  useEffect(()=>()=>{if(timerRef.current) clearInterval(timerRef.current)},[])

  const dt=DEVICE_TYPES.find(d=>d.type===selType)||DEVICE_TYPES[0]

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{...cardStyle({background:'linear-gradient(135deg,#0d1117,#1a0a0a)',border:`1px solid ${T.red}30`})}}>
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:'#ffd60a',marginBottom:4}}>🤖 Device Simulator</div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'rgba(255,255,255,0.5)'}}>IEEE 2030.5 real-time device simulation</div>
        {isOffline&&<div style={{marginTop:8,padding:'6px 10px',background:'rgba(245,158,11,0.15)',borderRadius:8,fontSize:11,color:T.amber,fontFamily:"'Share Tech Mono',monospace"}}>⚠️ Offline — readings will be saved locally only</div>}
      </div>

      {/* Live status */}
      {running&&(
        <div style={{...cardStyle({background:`linear-gradient(135deg,${T.green}15,${T.green}08)`,border:`1.5px solid ${T.green}40`})}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:12,height:12,borderRadius:'50%',background:T.green,boxShadow:`0 0 12px ${T.green}`,animation:'spin 1s linear infinite'}} />
            <div style={{flex:1}}>
              <div style={{fontWeight:800,fontSize:14,color:T.green}}>SIMULATION RUNNING</div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:T.text2}}>{sendCount} readings sent · every {interval}s</div>
            </div>
            <button onClick={stopSimulation} style={{background:'#fef2f2',border:`1px solid ${T.red}30`,borderRadius:10,padding:'8px 16px',fontWeight:700,fontSize:12,color:T.red,cursor:'pointer'}}>⏹ Stop</button>
          </div>
        </div>
      )}

      {/* Config */}
      <div style={cardStyle()}>
        <div style={{fontWeight:800,fontSize:14,color:T.text,marginBottom:14}}>⚙️ Simulator Config</div>

        {/* Device type */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,fontWeight:700,color:T.text2,display:'block',marginBottom:8}}>Device Type</label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {DEVICE_TYPES.map(d=>(
              <button key={d.type} onClick={()=>setSelType(d.type)} style={{padding:'10px 12px',borderRadius:12,border:`2px solid ${selType===d.type?T.red:T.border}`,background:selType===d.type?T.red+'12':T.bg,cursor:'pointer',display:'flex',alignItems:'center',gap:8,textAlign:'left' as const}}>
                <span style={{fontSize:18}}>{d.icon}</span>
                <div>
                  <div style={{fontWeight:700,fontSize:12,color:selType===d.type?T.red:T.text}}>{d.type}</div>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:T.text3}}>{d.power[0]}–{d.power[1]}W</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Block selector */}
        <div style={{marginBottom:14}}>
          <label style={{fontSize:12,fontWeight:700,color:T.text2,display:'block',marginBottom:8}}>Target Block</label>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {blocks.map((b:Block)=>(
              <button key={b.id} onClick={()=>setSelBlock(b.id)} style={{padding:'8px 14px',borderRadius:20,border:`2px solid ${selBlock===b.id?b.color:T.border}`,background:selBlock===b.id?b.color+'18':T.bg,fontWeight:700,fontSize:12,color:selBlock===b.id?b.color:T.text2,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                <span>{b.emoji}</span>{b.name}
              </button>
            ))}
          </div>
        </div>

        {/* Interval */}
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,fontWeight:700,color:T.text2,display:'block',marginBottom:8}}>Send Interval: <span style={{color:T.red,fontFamily:"'Orbitron',monospace"}}>{interval}s</span></label>
          <input type="range" min={1} max={30} value={interval} onChange={e=>setIntervalSec(+e.target.value)} style={{width:'100%',accentColor:T.red}} />
          <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:10,color:T.text3}}>1s (Fast)</span><span style={{fontSize:10,color:T.text3}}>30s (Slow)</span></div>
        </div>

        {/* Preview */}
        <div style={{background:T.bg,borderRadius:12,padding:'12px 14px',marginBottom:16,border:`1px solid ${T.border}`}}>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3,marginBottom:8,letterSpacing:1}}>NEXT READING PREVIEW</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {[{l:'Type',v:selType},{l:'Block',v:selBlock},{l:'Power Range',v:`${dt.power[0]}–${dt.power[1]}W`},{l:'Voltage',v:`${dt.voltage}V`}].map(r=>(
              <div key={r.l}><div style={{fontSize:10,color:T.text3}}>{r.l}</div><div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:T.text,fontWeight:700}}>{r.v}</div></div>
            ))}
          </div>
        </div>

        {!running
          ? <button onClick={startSimulation} style={ironBtn()}>▶ Start Simulation</button>
          : <button onClick={stopSimulation} style={{...ironBtn(),background:'#fef2f2',color:T.red,boxShadow:'none',border:`1px solid ${T.red}30`}}>⏹ Stop Simulation</button>
        }
      </div>

      {/* Live readings */}
      {readings.length>0&&(
        <div style={cardStyle({padding:0,overflow:'hidden'})}>
          <div style={{padding:'14px 16px',fontWeight:800,fontSize:13,color:T.text,borderBottom:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span>📡 Live Readings</span>
            <div style={pill(T.green)}>{readings.filter(r=>r.sent).length} sent</div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
              <thead><tr style={{background:`linear-gradient(135deg,#0d1117,#161b22)`}}>
                {['Device ID','Type','Power','Voltage','Temp','Status'].map(h=><th key={h} style={{padding:'8px 10px',textAlign:'left',fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'rgba(255,255,255,0.7)',letterSpacing:1,whiteSpace:'nowrap'}}>{h}</th>)}
              </tr></thead>
              <tbody>{readings.slice(0,10).map((r,i)=>(
                <tr key={i} style={{background:i%2===0?T.bg:T.card,borderBottom:`1px solid ${T.border}`,animation:'slideIn 0.3s ease'}}>
                  <td style={{padding:'8px 10px',fontFamily:"'Share Tech Mono',monospace",color:T.arc,fontSize:10,whiteSpace:'nowrap'}}>{r.deviceId.slice(-8)}</td>
                  <td style={{padding:'8px 10px',color:T.text2,fontSize:11}}>{r.type}</td>
                  <td style={{padding:'8px 10px',fontWeight:700,color:T.gold,fontFamily:"'Share Tech Mono',monospace"}}>{r.power}W</td>
                  <td style={{padding:'8px 10px',color:T.text2,fontFamily:"'Share Tech Mono',monospace"}}>{r.voltage}V</td>
                  <td style={{padding:'8px 10px',color:T.amber,fontFamily:"'Share Tech Mono',monospace"}}>{r.temperature}°C</td>
                  <td style={{padding:'8px 10px'}}><div style={pill(r.sent?T.green:T.amber)}>{r.sent?'Sent':'Local'}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 6. FIWARE INTEGRATION SCREEN ──────────────────────────────────────────────
function FIWAREScreen({T,blocks,sensors,apiOnline,isOffline,addNotification,cardStyle,ironBtn}:any) {
  const [orionUrl,setOrionUrl]=useState(FIWARE)
  const [orionStatus,setOrionStatus]=useState<'unknown'|'online'|'offline'>('unknown')
  const [entities,setEntities]=useState<any[]>([])
  const [pushing,setPushing]=useState(false)
  const [pushResults,setPushResults]=useState<{block:string;status:string;id:string}[]>([])
  const [loadingEntities,setLoadingEntities]=useState(false)

  const checkOrion=async()=>{
    setOrionStatus('unknown')
    try{const r=await fetch(orionUrl+'/v2/entities?limit=5');if(r.ok){setOrionStatus('online');const d=await r.json();setEntities(d);addNotification({title:'FIWARE Connected',message:`Orion broker online · ${d.length} entities found`,type:'success'})}else setOrionStatus('offline')}
    catch{setOrionStatus('offline');addNotification({title:'FIWARE Offline',message:'Cannot reach Orion broker at '+orionUrl,type:'warning'})}
  }

  const fetchEntities=async()=>{
    setLoadingEntities(true)
    try{const r=await fetch(orionUrl+'/v2/entities?limit=20');if(r.ok){const d=await r.json();setEntities(d)}}
    catch{}
    finally{setLoadingEntities(false)}
  }

  const pushToFIWARE=async()=>{
    setPushing(true);setPushResults([])
    const results:typeof pushResults=[]
    for(const b of blocks){
      const blockSensors=sensors[b.id]||[]
      const entity={
        id:`urn:ngsi-ld:EnergyBlock:${b.id}`,
        type:'EnergyBlock',
        name:{type:'Text',value:b.name},
        location:{type:'Text',value:b.location},
        generation:{type:'Number',value:b.generation,metadata:{unit:{value:'kW'}}},
        consumption:{type:'Number',value:b.consumption,metadata:{unit:{value:'kW'}}},
        netBalance:{type:'Number',value:b.net,metadata:{unit:{value:'kW'}}},
        status:{type:'Text',value:b.status},
        temperature:{type:'Number',value:blockSensors.find((s:Sensor)=>s.label==='Temperature')?.value||0},
        solarIrradiance:{type:'Number',value:blockSensors.find((s:Sensor)=>s.label==='Solar Irradiance')?.value||0},
        batterySOC:{type:'Number',value:blockSensors.find((s:Sensor)=>s.label==='Battery SOC')?.value||0},
        timestamp:{type:'DateTime',value:new Date().toISOString()},
      }
      try{
        // Try PATCH first (update), then POST (create)
        const patchR=await fetch(`${orionUrl}/v2/entities/${entity.id}/attrs`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(entity)})
        if(patchR.status===404){
          const postR=await fetch(`${orionUrl}/v2/entities`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entity)})
          results.push({block:b.name,status:postR.ok?'Created':'Failed',id:entity.id})
        } else {
          results.push({block:b.name,status:patchR.ok?'Updated':'Failed',id:entity.id})
        }
      } catch{results.push({block:b.name,status:'Error (CORS/Network)',id:entity.id})}
    }
    setPushResults(results);setPushing(false)
    addNotification({title:'FIWARE Push Complete',message:`${results.filter(r=>r.status!=='Error (CORS/Network)'&&r.status!=='Failed').length}/${results.length} entities synced`,type:'success'})
  }

  const orionColor=orionStatus==='online'?T.green:orionStatus==='offline'?T.red:T.amber

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{...cardStyle({background:'linear-gradient(135deg,#0d1117,#0a1628)',border:`1px solid ${T.arc}30`})}}>
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:T.arc,marginBottom:4}}>🔥 FIWARE Integration</div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'rgba(255,255,255,0.5)'}}>NGSI-v2 · Orion Context Broker</div>
      </div>

      {/* Orion connection */}
      <div style={cardStyle()}>
        <div style={{fontWeight:800,fontSize:14,color:T.text,marginBottom:12}}>Orion Broker URL</div>
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <input value={orionUrl} onChange={e=>setOrionUrl(e.target.value)} style={{flex:1,padding:'10px 14px',border:`1.5px solid ${T.border}`,borderRadius:12,fontSize:13,fontFamily:"'Share Tech Mono',monospace",color:T.text,background:T.bg,outline:'none'}} placeholder="http://localhost:1026" />
          <button onClick={checkOrion} style={{background:T.arc,color:'#fff',border:'none',borderRadius:12,padding:'10px 16px',fontWeight:700,fontSize:12,cursor:'pointer',whiteSpace:'nowrap'}}>Test</button>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:T.bg,borderRadius:12,border:`1px solid ${orionColor}30`}}>
          <div style={{width:10,height:10,borderRadius:'50%',background:orionColor,boxShadow:`0 0 8px ${orionColor}`}} />
          <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:orionColor,fontWeight:700}}>{orionStatus==='online'?'ORION ONLINE':orionStatus==='offline'?'ORION OFFLINE':'NOT TESTED'}</span>
          {orionStatus==='offline'&&<span style={{fontSize:11,color:T.text3,marginLeft:8}}>Tip: Make sure Orion is running on port 1026</span>}
        </div>
      </div>

      {/* Push data */}
      <div style={cardStyle()}>
        <div style={{fontWeight:800,fontSize:14,color:T.text,marginBottom:8}}>Push Block Data to FIWARE</div>
        <div style={{fontSize:12,color:T.text2,marginBottom:14}}>Pushes all {blocks.length} energy blocks as NGSI-v2 entities to Orion</div>
        <div style={{background:T.bg,borderRadius:12,padding:'12px 14px',marginBottom:14,border:`1px solid ${T.border}`}}>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3,marginBottom:8}}>NGSI-v2 ENTITY STRUCTURE</div>
          <pre style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.arc,lineHeight:1.6,overflowX:'auto'}}>{`{
  "id": "urn:ngsi-ld:EnergyBlock:BLK-A",
  "type": "EnergyBlock",
  "generation": { "value": 145.8, "unit": "kW" },
  "consumption": { "value": 98.2, "unit": "kW" },
  "status": { "value": "Surplus" },
  "temperature": { "value": 20.3 },
  "batterySOC": { "value": 43 }
}`}</pre>
        </div>
        <button onClick={pushToFIWARE} disabled={pushing||isOffline} style={ironBtn({background:pushing?T.text3:'linear-gradient(135deg,#0d4f6e,#58c4dc)',boxShadow:`0 4px 16px ${T.arc}40`})}>
          {pushing?<><div style={{width:16,height:16,border:'2px solid #fff',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>Pushing...</>:'📤 Push All Blocks to FIWARE'}
        </button>
      </div>

      {/* Push results */}
      {pushResults.length>0&&(
        <div style={cardStyle()}>
          <div style={{fontWeight:800,fontSize:14,color:T.text,marginBottom:12}}>Push Results</div>
          {pushResults.map((r,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:i<pushResults.length-1?`1px solid ${T.border}`:'none'}}>
              <span style={{fontWeight:700,fontSize:13,color:T.text}}>{r.block}</span>
              <div style={{display:'flex',flex:1,justifyContent:'center'}}><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:160}}>{r.id.slice(-20)}</span></div>
              <div style={{...{fontFamily:"'Share Tech Mono',monospace",fontSize:10,letterSpacing:1.5,padding:'3px 10px',borderRadius:20,textTransform:'uppercase' as const},background:(r.status==='Created'||r.status==='Updated')?T.greenL:T.redLight,border:`1px solid ${(r.status==='Created'||r.status==='Updated')?T.green:T.red}60`,color:(r.status==='Created'||r.status==='Updated')?T.green:T.red}}>{r.status}</div>
            </div>
          ))}
        </div>
      )}

      {/* Entities from Orion */}
      {orionStatus==='online'&&(
        <div style={cardStyle()}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontWeight:800,fontSize:14,color:T.text}}>Orion Entities ({entities.length})</div>
            <button onClick={fetchEntities} style={{background:T.arcLight,border:`1px solid ${T.arc}40`,borderRadius:10,padding:'6px 12px',fontSize:11,fontWeight:700,color:T.arc,cursor:'pointer'}}>↺ Refresh</button>
          </div>
          {loadingEntities?<div style={{textAlign:'center',padding:20,color:T.text3}}>Loading...</div>:
            entities.length===0?<div style={{textAlign:'center',padding:20,color:T.text3,fontSize:13}}>No entities in Orion yet</div>:
            entities.map((e:any,i:number)=>(
              <div key={i} style={{padding:'10px 12px',background:T.bg,borderRadius:12,marginBottom:8,border:`1px solid ${T.border}`}}>
                <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:T.arc,fontWeight:700}}>{e.id}</div>
                <div style={{fontSize:11,color:T.text3,marginTop:2}}>Type: {e.type}</div>
              </div>
            ))
          }
        </div>
      )}

      <div style={{padding:'12px 14px',background:T.arcLight,borderRadius:12,border:`1px solid ${T.arc}30`,fontSize:12,color:T.arc}}>
        💡 <strong>Note:</strong> FIWARE Orion runs locally on port 1026. For production, use your public Orion URL. CORS must be enabled on the broker.
      </div>
    </div>
  )
}

// ── ALERTS ────────────────────────────────────────────────────────────────────
function AlertsScreen({T,alerts,onMarkRead,onMarkAll,cardStyle,pill}:any) {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{...cardStyle({background:'linear-gradient(135deg,#0d1117,#161b22)',border:'none'}),display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:'#e63946'}}>⚠️ Alerts</div><div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'rgba(255,255,255,0.5)',marginTop:4}}>{alerts.filter((a:Alert)=>!a.read).length} unread</div></div>
        {alerts.some((a:Alert)=>!a.read)&&<button onClick={onMarkAll} style={{background:T.arcLight,border:`1px solid ${T.arc}`,borderRadius:10,padding:'8px 14px',fontWeight:700,fontSize:12,color:T.arc,cursor:'pointer'}}>Mark all read</button>}
      </div>
      {alerts.length===0&&<div style={cardStyle({textAlign:'center',padding:'40px 20px'})}><div style={{fontSize:48,marginBottom:12}}>✅</div><div style={{fontWeight:700,fontSize:16,color:T.text}}>All clear!</div></div>}
      {alerts.map((a:Alert)=>{const c=a.severity==='high'?T.red:a.severity==='medium'?T.amber:T.arc;return(
        <div key={a.id} style={cardStyle({border:`1.5px solid ${c}30`,background:a.read?T.card:`${c}08`,opacity:a.read?0.6:1})}>
          <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
            <div style={{width:42,height:42,borderRadius:14,background:`${c}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>{a.type==='deficit'?'⚡':a.type==='battery'?'🔋':'🔌'}</div>
            <div style={{flex:1}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><div style={pill(c)}>{a.severity}</div><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3}}>{a.time}</span></div>
              <div style={{fontSize:13,color:T.text,lineHeight:1.5,marginBottom:8}}>{a.message}</div>
              {!a.read&&<button onClick={()=>onMarkRead(a.id)} style={{background:'none',border:`1px solid ${T.border}`,borderRadius:8,padding:'5px 12px',fontSize:11,fontWeight:600,color:T.text2,cursor:'pointer'}}>Mark read</button>}
            </div>
          </div>
        </div>
      )})}
    </div>
  )
}

// ── DEMAND ────────────────────────────────────────────────────────────────────
function DemandScreen({T,blocks,apiOnline,cardStyle,pill,goldBtn}:any) {
  const [triggered,setTriggered]=useState<string[]>([])
  const [targetPct,setTargetPct]=useState(15)
  const [duration,setDuration]=useState(30)
  const [drType,setDrType]=useState('Load Reduction')
  const [events,setEvents]=useState([
    {id:'DR-001',block:'BLK-B',type:'Load Reduction',target:15,duration:30,status:'Active',time:'10:42'},
    {id:'DR-002',block:'BLK-A',type:'Peak Shaving',target:10,duration:60,status:'Scheduled',time:'14:00'}
  ])

  const trigger=(blockId:string)=>{
    setTriggered(p=>[...p,blockId])
    setEvents(p=>[...p,{
      id:'DR-'+Date.now(),block:blockId,type:drType,
      target:targetPct,duration:duration,status:'Active',
      time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
    }])
    setTimeout(()=>setTriggered(p=>p.filter(x=>x!==blockId)),3000)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{...cardStyle({background:'linear-gradient(135deg,#0d1117,#161b22)',border:'none'})}}>
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:'#ffd60a'}}>⚡ Demand Response</div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'rgba(255,255,255,0.5)',marginTop:4}}>IEEE 2030.5 DR Events</div>
      </div>

      {/* DR Configuration */}
      <div style={cardStyle()}>
        <div style={{fontWeight:800,fontSize:14,color:T.text,marginBottom:16}}>⚙️ Configure DR Event</div>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {/* DR Type */}
          <div>
            <label style={{fontSize:12,fontWeight:700,color:T.text2,display:'block',marginBottom:8}}>Event Type</label>
            <div style={{display:'flex',gap:8}}>
              {['Load Reduction','Peak Shaving','Frequency Response'].map(t=>(
                <button key={t} onClick={()=>setDrType(t)}
                  style={{flex:1,padding:'8px 6px',borderRadius:10,border:`2px solid ${drType===t?T.gold:T.border}`,background:drType===t?T.gold+'18':T.bg,fontWeight:700,fontSize:11,color:drType===t?T.gold:T.text2,cursor:'pointer'}}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Target % slider */}
          <div>
            <label style={{fontSize:12,fontWeight:700,color:T.text2,display:'block',marginBottom:6}}>
              Target Energy Reduction: <span style={{fontFamily:"'Orbitron',monospace",color:T.red,fontSize:14}}>{targetPct}%</span>
            </label>
            <input type="range" min={5} max={50} step={5} value={targetPct}
              onChange={e=>setTargetPct(+e.target.value)}
              style={{width:'100%',accentColor:T.red,height:6,cursor:'pointer'}}
            />
            <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
              <span style={{fontSize:10,color:T.text3}}>5% (Low)</span>
              <span style={{fontSize:10,color:T.text3}}>25% (Medium)</span>
              <span style={{fontSize:10,color:T.text3}}>50% (High)</span>
            </div>
          </div>

          {/* Duration slider */}
          <div>
            <label style={{fontSize:12,fontWeight:700,color:T.text2,display:'block',marginBottom:6}}>
              Duration: <span style={{fontFamily:"'Orbitron',monospace",color:T.arc,fontSize:14}}>{duration} min</span>
            </label>
            <input type="range" min={15} max={120} step={15} value={duration}
              onChange={e=>setDuration(+e.target.value)}
              style={{width:'100%',accentColor:T.arc,height:6,cursor:'pointer'}}
            />
            <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
              <span style={{fontSize:10,color:T.text3}}>15 min</span>
              <span style={{fontSize:10,color:T.text3}}>60 min</span>
              <span style={{fontSize:10,color:T.text3}}>120 min</span>
            </div>
          </div>

          {/* Preview */}
          <div style={{background:T.bg,borderRadius:12,padding:'12px 14px',border:`1px solid ${T.border}`}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3,marginBottom:8,letterSpacing:1}}>EVENT PREVIEW</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
              {[{l:'Type',v:drType.split(' ')[0]},{l:'Target',v:targetPct+'%'},{l:'Duration',v:duration+' min'}].map(r=>(
                <div key={r.l} style={{textAlign:'center'}}>
                  <div style={{fontWeight:800,fontSize:14,color:T.text}}>{r.v}</div>
                  <div style={{fontSize:10,color:T.text3,marginTop:2}}>{r.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <SH T={T} title="Active Events" />
      {events.map(e=>(
        <div key={e.id} style={cardStyle({border:`1.5px solid ${e.status==='Active'?T.gold:T.border}`})}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
            <div><div style={{fontWeight:800,fontSize:14,color:T.text}}>{e.type}</div><div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3}}>{e.id}</div></div>
            <div style={pill(e.status==='Active'?T.gold:T.arc)}>{e.status}</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
            {[{l:'Target',v:e.target+'%'},{l:'Duration',v:e.duration+' min'},{l:'Time',v:e.time}].map(r=>(
              <div key={r.l} style={{background:T.bg,borderRadius:10,padding:'8px',textAlign:'center'}}>
                <div style={{fontWeight:800,fontSize:14,color:r.l==='Target'?T.red:r.l==='Duration'?T.arc:T.text}}>{r.v}</div>
                <div style={{fontSize:10,color:T.text3}}>{r.l}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <SH T={T} title="Trigger for Block" />
      {blocks.map((b:Block)=>(
        <div key={b.id} style={{...cardStyle(),display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontSize:20}}>{b.emoji}</span>
            <div>
              <div style={{fontWeight:700,fontSize:13,color:T.text}}>{b.name} — {b.location}</div>
              <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2}}>
                <div style={pill(b.status==='Surplus'?T.green:b.status==='Deficit'?T.red:T.arc)}>{b.status}</div>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3}}>{b.net>=0?'+':''}{b.net.toFixed(1)} kW</span>
              </div>
            </div>
          </div>
          <button onClick={()=>trigger(b.id)} disabled={triggered.includes(b.id)}
            style={{background:triggered.includes(b.id)?T.green:`linear-gradient(135deg,#e5b800,#ffd60a)`,color:triggered.includes(b.id)?'#fff':'#0d1117',border:'none',borderRadius:10,padding:'8px 14px',fontWeight:700,fontSize:12,cursor:'pointer',boxShadow:triggered.includes(b.id)?'none':`0 4px 12px ${T.gold}40`}}>
            {triggered.includes(b.id)?'✓ Sent':'▶ Trigger'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── HISTORY ───────────────────────────────────────────────────────────────────
function HistoryScreen({T,history,blocks,cardStyle,ironBtn}:any) {
  const [sel,setSel]=useState('BLK-A')
  const entries:HistoryEntry[]=(history[sel]||[]).slice().reverse().slice(0,20)
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{...cardStyle({background:'linear-gradient(135deg,#0d1117,#161b22)',border:'none'}),display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:T.arc}}>📋 History</div><div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'rgba(255,255,255,0.5)',marginTop:4}}>Energy readings log</div></div>
        <button onClick={()=>import('xlsx').then(X=>{const ws=X.utils.json_to_sheet(entries);const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,'History');X.writeFile(wb,`vcg_${sel}.xlsx`)})} style={{background:`linear-gradient(135deg,${T.green},#059669)`,color:'#fff',border:'none',borderRadius:12,padding:'9px 14px',fontWeight:700,fontSize:12,cursor:'pointer'}}>⬇️ Export</button>
      </div>
      <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:4}}>{blocks.map((b:Block)=><button key={b.id} onClick={()=>setSel(b.id)} style={{flexShrink:0,padding:'8px 16px',borderRadius:20,border:`2px solid ${sel===b.id?b.color:T.border}`,background:sel===b.id?b.color+'18':T.card,fontWeight:700,fontSize:12,color:sel===b.id?b.color:T.text2,cursor:'pointer'}}>{b.name}</button>)}</div>
      <div style={cardStyle()}><div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:12}}>Generation Trend</div><LineChart data={entries.slice(0,12).reverse().map((e:HistoryEntry)=>+e.generation)} color={T.green} height={90} T={T}/></div>
      <div style={cardStyle({padding:0,overflow:'hidden'})}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr style={{background:'linear-gradient(135deg,#0d1117,#161b22)'}}>{['Time','Gen','Con','Net','Cost €'].map(h=><th key={h} style={{padding:'12px 10px',textAlign:'left',fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'rgba(255,255,255,0.7)',letterSpacing:1}}>{h}</th>)}</tr></thead>
            <tbody>{entries.map((e:HistoryEntry,i:number)=>(
              <tr key={i} style={{background:i%2===0?T.bg:T.card,borderBottom:`1px solid ${T.border}`}}>
                <td style={{padding:'10px',fontFamily:"'Share Tech Mono',monospace",color:T.text2,fontSize:11}}>{e.time}</td>
                <td style={{padding:'10px',fontWeight:700,color:T.green}}>{e.generation}</td>
                <td style={{padding:'10px',fontWeight:700,color:T.amber}}>{e.consumption}</td>
                <td style={{padding:'10px',fontWeight:700,color:e.net>=0?T.green:T.red}}>{e.net>=0?'+':''}{e.net}</td>
                <td style={{padding:'10px',fontWeight:700,color:T.text2}}>€{e.cost}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── COST ──────────────────────────────────────────────────────────────────────
function CostScreen({T,blocks,sensors,cardStyle}:any) {
  const rate=0.38
  const totalCost=blocks.reduce((s:number,b:Block)=>s+parseFloat((b.consumption*rate/1000*3600).toFixed(2)),0)
  const totalSave=blocks.reduce((s:number,b:Block)=>s+parseFloat((b.generation*rate/1000*3600).toFixed(2)),0)
  const totalCO2=Object.values(sensors).flat().filter((s:any)=>s.label==='CO₂ Saved').reduce((t:number,s:any)=>t+s.value,0)
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={cardStyle({background:'linear-gradient(135deg,#0d1117,#161b22)',border:'none'})}><div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:'#ffd60a'}}>💰 Cost & Savings</div></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        {[{icon:'💸',l:'Daily Cost',v:`€${totalCost.toFixed(2)}`,c:T.red,bg:T.redLight},{icon:'💚',l:'Solar Savings',v:`€${totalSave.toFixed(2)}`,c:T.green,bg:T.greenL},{icon:'🌿',l:'CO₂ Saved',v:`${(+totalCO2).toFixed(1)}kg`,c:T.arc,bg:T.arcLight},{icon:'📊',l:'Rate/kWh',v:`€${rate}`,c:T.amber,bg:T.amberL}].map(s=>(
          <div key={s.l} style={{background:s.bg,borderRadius:18,padding:'18px 16px',border:`1px solid ${s.c}20`}}>
            <div style={{fontSize:28,marginBottom:8}}>{s.icon}</div>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:20,fontWeight:900,color:s.c}}>{s.v}</div>
            <div style={{fontSize:11,color:T.text2,marginTop:4,fontWeight:600}}>{s.l}</div>
          </div>
        ))}
      </div>
      <div style={cardStyle()}><div style={{fontWeight:800,fontSize:14,color:T.text,marginBottom:14}}>Cost Distribution</div><DonutChart segments={blocks.map((b:Block)=>({label:b.name,value:parseFloat((b.consumption*rate/1000*3600).toFixed(2)),color:b.color}))} size={160} T={T}/></div>
      <SH T={T} title="Per Block" />
      {blocks.map((b:Block)=>{const cost=+(b.consumption*rate/1000*3600).toFixed(3);const save=+(b.generation*rate/1000*3600).toFixed(3);const net=+(save-cost).toFixed(3);return(
        <div key={b.id} style={cardStyle()}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}><div style={{width:40,height:40,borderRadius:12,background:b.color+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{b.emoji}</div><div style={{flex:1}}><div style={{fontWeight:800,fontSize:14,color:T.text}}>{b.name}</div></div><div style={{fontFamily:"'Orbitron',monospace",fontWeight:900,fontSize:16,color:net>=0?T.green:T.red}}>{net>=0?'+€':'−€'}{Math.abs(net).toFixed(3)}</div></div>
          <HBarChart data={[{label:'Cost',value:cost,max:cost+save,color:T.red},{label:'Savings',value:save,max:cost+save,color:T.green}]} T={T}/>
        </div>
      )})}
    </div>
  )
}

// ── DEVICES ───────────────────────────────────────────────────────────────────
function DevicesScreen({T,devices,blocks,activeDevice,onDelete,cardStyle,pill,ironBtn}:any) {
  const [sel,setSel]=useState<Device|null>(activeDevice)
  if(sel) return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={cardStyle()}><button onClick={()=>setSel(null)} style={{background:T.bg,border:'none',borderRadius:10,padding:'7px 14px',fontSize:12,fontWeight:700,color:T.text2,cursor:'pointer',marginBottom:14}}>← Back</button><div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:T.text}}>📟 Device Detail</div></div>
      <div style={cardStyle({border:`2px solid ${sel.status==='Online'?T.green:T.amber}`})}>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:18}}><div style={{width:56,height:56,borderRadius:18,background:T.arcLight,display:'flex',alignItems:'center',justifyContent:'center',fontSize:28}}>📟</div><div><div style={{fontFamily:"'Share Tech Mono',monospace",fontWeight:700,fontSize:16,color:T.arc}}>{sel.sfdi}</div><div style={{fontSize:13,color:T.text2}}>{sel.type}</div><div style={pill(sel.status==='Online'?T.green:T.amber)}>{sel.status}</div></div></div>
        {[{l:'LFDI',v:sel.lfdi||'—'},{l:'Type',v:sel.type},{l:'Block',v:blocks.find((b:Block)=>b.id===sel.block)?.name||sel.block},{l:'Power',v:sel.power?sel.power+'W':'—'},{l:'Voltage',v:sel.voltage?sel.voltage+'V':'—'},{l:'Last Seen',v:sel.lastSeen||'—'}].map(r=>(
          <div key={r.l} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:`1px solid ${T.border}`}}><span style={{fontSize:12,color:T.text2,fontWeight:600}}>{r.l}</span><span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:T.text,fontWeight:700,maxWidth:'55%',textAlign:'right'}}>{r.v}</span></div>
        ))}
        <button onClick={()=>{onDelete(sel.sfdi);setSel(null)}} style={{...ironBtn(),marginTop:16,background:T.redLight,color:T.red,boxShadow:'none',border:`1px solid ${T.red}30`}}>🗑️ Deregister</button>
      </div>
    </div>
  )
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{...cardStyle({background:'linear-gradient(135deg,#0d1117,#161b22)',border:'none'}),display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:T.arc}}>📟 Devices</div><div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'rgba(255,255,255,0.5)',marginTop:4}}>{devices.length} total · {devices.filter((d:Device)=>d.status==='Online').length} online</div></div></div>
      {blocks.map((b:Block)=>{const bd=devices.filter((d:Device)=>d.block===b.id);if(!bd.length) return null;return(
        <div key={b.id}><div style={{fontWeight:700,fontSize:12,color:T.text2,padding:'4px 4px 8px',display:'flex',alignItems:'center',gap:6}}><span>{b.emoji}</span>{b.name} — {b.location}</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>{bd.map((d:Device,i:number)=>(
            <div key={i} onClick={()=>setSel(d)} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:T.card,borderRadius:16,border:`1px solid ${T.border}`,cursor:'pointer',transition:'all 0.15s'}}
              onMouseOver={e=>{e.currentTarget.style.borderColor=T.arc+'50'}} onMouseOut={e=>{e.currentTarget.style.borderColor=T.border}}>
              <div style={{width:38,height:38,borderRadius:12,background:b.color+'15',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>📟</div>
              <div style={{flex:1}}><div style={{fontFamily:"'Share Tech Mono',monospace",fontWeight:700,fontSize:12,color:T.arc}}>{d.sfdi}</div><div style={{fontSize:11,color:T.text3}}>{d.type}{d.power?` · ${d.power}W`:''}</div></div>
              <div style={pill(d.status==='Online'?T.green:T.amber)}>{d.status}</div>
              <span style={{color:T.text3}}>›</span>
            </div>
          ))}</div>
        </div>
      )})}
    </div>
  )
}

// ── MAP ───────────────────────────────────────────────────────────────────────
function MapScreen({T,blocks,cardStyle,pill}:any) {
  const W=380,H=400
  const irelandPath="M190,20 C210,18 230,22 245,35 C260,48 268,58 272,72 C278,90 275,105 270,118 C265,130 258,138 252,148 C248,158 246,168 244,180 C242,195 240,210 238,225 C234,240 228,252 220,262 C210,274 198,282 188,290 C178,298 168,304 158,312 C148,320 140,330 135,342 C130,354 128,366 130,378 C132,388 138,394 145,398 L162,394 C168,388 170,378 168,368 C166,358 160,350 155,342 C150,334 145,326 142,316 C138,304 136,292 138,280 C140,268 146,258 150,246 C154,234 156,222 155,210 C154,198 150,187 145,178 C140,168 134,160 128,152 C120,142 112,134 106,124 C98,112 92,100 90,86 C88,72 90,58 96,46 C102,34 112,24 124,18 Z"
  const toXY=(lat:number,lng:number)=>({x:((lng-(-10.5))/((-5.5)-(-10.5)))*(W*0.6)+W*0.2,y:((54.5-lat)/((54.5)-(51.3)))*(H*0.8)+H*0.06})
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={cardStyle({background:'linear-gradient(135deg,#0d1117,#0a1628)',border:'none'})}><div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:T.arc}}>🗺️ Ireland Map</div></div>
      <div style={cardStyle({padding:16,overflow:'hidden'})}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block'}}>
          <rect width={W} height={H} fill="#e8f4fd" rx="12"/>
          <path d={irelandPath} fill="#d4edda" stroke="#10b981" strokeWidth="1.5"/>
          {blocks.map((b:Block)=>{const {x,y}=toXY(b.lat,b.lng);const sc=b.status==='Surplus'?T.green:b.status==='Deficit'?T.red:T.arc;return(
            <g key={b.id}><circle cx={x} cy={y} r={16} fill={b.color} opacity={0.15}/><circle cx={x} cy={y} r={10} fill={b.color} opacity={0.3}/><circle cx={x} cy={y} r={7} fill={b.color} stroke="#fff" strokeWidth="2"/><rect x={x+12} y={y-13} width={76} height={26} rx="7" fill="white" opacity="0.95"/><text x={x+16} y={y-1} fontSize="9" fontWeight="700" fill="#0d1117" fontFamily="Plus Jakarta Sans,sans-serif">{b.name}</text><text x={x+16} y={y+10} fontSize="8" fill="#9aa5b4" fontFamily="Plus Jakarta Sans,sans-serif">{b.location}</text></g>
          )})}
        </svg>
      </div>
      <div style={cardStyle()}>{blocks.map((b:Block)=>{const sc=b.status==='Surplus'?T.green:b.status==='Deficit'?T.red:T.arc;return(<div key={b.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:`1px solid ${T.border}`}}><div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:12,height:12,borderRadius:'50%',background:b.color}}/><span style={{fontWeight:700,fontSize:13,color:T.text}}>{b.emoji} {b.name}</span><span style={{fontSize:11,color:T.text3}}>{b.location}</span></div><div style={pill(sc)}>{b.status}</div></div>)})}</div>
    </div>
  )
}

// ── COMPARE ───────────────────────────────────────────────────────────────────
function CompareScreen({T,blocks,sensors,cardStyle}:any) {
  const sorted=[...blocks].sort((a:Block,b:Block)=>b.net-a.net)
  const maxGen=Math.max(...blocks.map((b:Block)=>b.generation),1)
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={cardStyle({background:'linear-gradient(135deg,#0d1117,#161b22)',border:'none'})}><div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:'#ffd60a'}}>🏆 Compare</div></div>
      {sorted.map((b:Block,i:number)=>(
        <div key={b.id} style={cardStyle({border:`1.5px solid ${i===0?T.gold:T.border}`})}>
          <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:12}}><div style={{width:40,height:40,borderRadius:14,background:i===0?T.goldLight:'#f8faff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅'}</div><div style={{flex:1}}><div style={{fontWeight:800,fontSize:15,color:T.text}}>{b.emoji} {b.name} — {b.location}</div></div><div style={{textAlign:'right'}}><div style={{fontFamily:"'Orbitron',monospace",fontSize:20,color:b.net>=0?T.green:T.red}}>{b.net>=0?'+':''}{b.net.toFixed(1)}</div><div style={{fontSize:10,color:T.text3}}>kW Net</div></div></div>
          <HBarChart data={[{label:'Generation',value:b.generation,max:maxGen,color:T.green},{label:'Consumption',value:b.consumption,max:maxGen,color:T.red}]} T={T}/>
        </div>
      ))}
      <div style={cardStyle({padding:0,overflow:'hidden'})}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
            <thead><tr style={{background:'linear-gradient(135deg,#0d1117,#161b22)'}}><th style={{padding:'10px 12px',textAlign:'left',color:'rgba(255,255,255,0.7)',fontFamily:"'Share Tech Mono',monospace",fontSize:9,letterSpacing:1}}>Sensor</th>{blocks.map((b:Block)=><th key={b.id} style={{padding:'10px 8px',textAlign:'center',color:b.color,fontFamily:"'Share Tech Mono',monospace",fontSize:9}}>{b.name.replace('Block ','')}</th>)}</tr></thead>
            <tbody>{(sensors[blocks[0]?.id]||[]).map((s:Sensor,i:number)=>(
              <tr key={s.label} style={{background:i%2===0?T.bg:T.card,borderBottom:`1px solid ${T.border}`}}>
                <td style={{padding:'10px 12px',display:'flex',alignItems:'center',gap:6}}><span style={{fontSize:14}}>{s.icon}</span><span style={{color:T.text2,fontSize:11}}>{s.label}</span></td>
                {blocks.map((b:Block)=>{const sv=sensors[b.id]?.[i];return <td key={b.id} style={{padding:'10px 8px',textAlign:'center',fontWeight:700,color:sv?.color||T.text,fontSize:12}}>{sv?.value||'—'}<span style={{fontSize:9,color:T.text3,fontWeight:400}}> {sv?.unit}</span></td>})}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── REGISTER ──────────────────────────────────────────────────────────────────
function RegisterScreen({T,blocks,activeBlock,onBack,apiOnline,onDeviceAdded,cardStyle,ironBtn,lbl,inp}:any) {
  const [form,setForm]=useState({sfdi:'',lfdi:'',deviceType:'Smart Meter',block:activeBlock?.id||blocks[0]?.id||'BLK-A',realPower:'',voltage:''})
  const [msg,setMsg]=useState('');const [loading,setLoading]=useState(false)
  const submit=async()=>{
    if(!form.sfdi||!form.lfdi){setMsg('⚠️ SFDI and LFDI required');return}
    setLoading(true)
    try{const r=await fetch(API_V1+'/edev',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});if(r.ok){onDeviceAdded({...form,status:'Online',power:+form.realPower||0,voltage:+form.voltage||0,lastSeen:'Just now'});setMsg('✅ Registered!')}else setMsg('❌ Failed')}
    catch{onDeviceAdded({...form,status:'Online',power:+form.realPower||0,voltage:+form.voltage||0,lastSeen:'Just now'});setMsg('📴 Saved locally')}
    setLoading(false);setTimeout(()=>setMsg(''),3000)
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={cardStyle()}><button onClick={onBack} style={{background:T.bg,border:'none',borderRadius:10,padding:'7px 14px',fontSize:12,fontWeight:700,color:T.text2,cursor:'pointer',marginBottom:14}}>← Back</button><div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:T.text}}>➕ Register Device</div></div>
      <div style={cardStyle()}>
        <div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:12}}>Select Block</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>{blocks.map((b:Block)=>(<button key={b.id} onClick={()=>setForm(p=>({...p,block:b.id}))} style={{padding:'10px',borderRadius:12,border:`2px solid ${form.block===b.id?b.color:T.border}`,background:form.block===b.id?b.color+'12':T.bg,cursor:'pointer',textAlign:'left' as const}}><div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{fontSize:18}}>{b.emoji}</span><div><div style={{fontWeight:700,fontSize:12,color:form.block===b.id?b.color:T.text}}>{b.name}</div><div style={{fontSize:10,color:T.text3}}>{b.location}</div></div></div></button>))}</div>
      </div>
      <div style={cardStyle()}>
        <div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:14}}>Device Identity</div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {[{l:'SFDI *',k:'sfdi',ph:'SM_BlockA_001'},{l:'LFDI *',k:'lfdi',ph:'LFDI-SM-001'}].map(f=>(<div key={f.k}><label style={lbl}>{f.l}</label><input style={inp()} placeholder={f.ph} value={(form as any)[f.k]} onChange={e=>setForm(p=>({...p,[f.k]:e.target.value}))} onFocus={e=>(e.target.style.borderColor=T.red)} onBlur={e=>(e.target.style.borderColor=T.border)}/></div>))}
          <div><label style={lbl}>Device Type</label><select style={inp({cursor:'pointer'})} value={form.deviceType} onChange={e=>setForm(p=>({...p,deviceType:e.target.value}))}>{['Smart Meter','Solar Inverter','EV Charger','HVAC','Battery Storage','Wind Turbine','Load Controller'].map(t=><option key={t}>{t}</option>)}</select></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div><label style={lbl}>Power (W)</label><input style={inp()} placeholder="1400" value={form.realPower} onChange={e=>setForm(p=>({...p,realPower:e.target.value}))} onFocus={e=>(e.target.style.borderColor=T.red)} onBlur={e=>(e.target.style.borderColor=T.border)}/></div>
            <div><label style={lbl}>Voltage (V)</label><input style={inp()} placeholder="230" value={form.voltage} onChange={e=>setForm(p=>({...p,voltage:e.target.value}))} onFocus={e=>(e.target.style.borderColor=T.red)} onBlur={e=>(e.target.style.borderColor=T.border)}/></div>
          </div>
        </div>
      </div>
      <button onClick={submit} disabled={loading} style={ironBtn({background:loading?T.text3:undefined})}>{loading?<><div style={{width:16,height:16,border:'2px solid #fff',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>Registering...</>:'⊕ Register Device'}</button>
      {msg&&<div style={{padding:'12px',borderRadius:12,background:msg.startsWith('✅')?T.greenL:'#fef2f2',fontSize:13,fontWeight:700,color:msg.startsWith('✅')?T.green:T.red,textAlign:'center'}}>{msg}</div>}
    </div>
  )
}

// ── IMPORT ────────────────────────────────────────────────────────────────────
function ImportScreen({T,blocks,onBack,onBlocksImported,onDevicesImported,cardStyle,ironBtn}:any) {
  const [tab,setTab]=useState<'communities'|'devices'>('communities')
  const [preview,setPreview]=useState<any[]>([]);const [error,setError]=useState('');const [success,setSuccess]=useState('');const [fileName,setFileName]=useState('')
  const COLORS=['#e63946','#ffd60a','#58c4dc','#10b981','#f97316','#8b5cf6']
  const EMOJIS=['🏙️','🏘️','🌆','🌉','🏚️','🌃']
  const readExcel=(file:File)=>{setError('');setSuccess('');setPreview([]);setFileName(file.name);const reader=new FileReader();reader.onload=(e)=>{import('xlsx').then(X=>{try{const data=new Uint8Array(e.target?.result as ArrayBuffer);const wb=X.read(data,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const rows:any[]=X.utils.sheet_to_json(ws);if(!rows.length){setError('No data');return}setPreview(rows.slice(0,10))}catch{setError('Could not read file')}})};reader.readAsArrayBuffer(file)}
  const importData=()=>{
    if(!preview.length){setError('No data');return}
    if(tab==='communities'){const nb=preview.map((row:any,i:number)=>{const gen=parseFloat(row['Generation (kW)']||100);const con=parseFloat(row['Consumption (kW)']||80);const net=+(gen-con).toFixed(1);const idx=blocks.length+i;return{id:row['Block ID']||`BLK-${String.fromCharCode(65+idx)}`,name:row['Block Name']||`Block ${String.fromCharCode(65+idx)}`,location:row['Location']||'Ireland',emoji:EMOJIS[idx%EMOJIS.length],generation:gen,consumption:con,net,status:net>0.5?'Surplus':net<-0.5?'Deficit':'Balanced',devices:+row['Devices']||0,color:COLORS[idx%COLORS.length],lat:53+Math.random()*2,lng:-8+Math.random()*3}});onBlocksImported(nb);setSuccess(`✅ Imported ${nb.length} blocks!`)}
    else{const nd=preview.map((row:any)=>({sfdi:row['Device ID (SFDI)']||'DEV-'+Math.random().toString(36).slice(2,6).toUpperCase(),lfdi:row['Long Form ID (LFDI)']||'',type:row['Device Type']||'Smart Meter',block:row['Block ID']||blocks[0]?.id||'BLK-A',status:'Online',power:+row['Real Power (W)']||0,voltage:+row['Voltage (V)']||230,lastSeen:'Just imported'}));onDevicesImported(nd);setSuccess(`✅ Imported ${nd.length} devices!`)}
    setTimeout(()=>onBack(),1500)
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={cardStyle()}><button onClick={onBack} style={{background:T.bg,border:'none',borderRadius:10,padding:'7px 14px',fontSize:12,fontWeight:700,color:T.text2,cursor:'pointer',marginBottom:14}}>← Back</button><div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:T.text}}>📊 Import Excel</div></div>
      <div style={{display:'flex',gap:8,background:T.card,borderRadius:16,padding:8}}>{(['communities','devices'] as const).map(t=><button key={t} onClick={()=>{setTab(t);setPreview([]);setFileName('');setError('');setSuccess('')}} style={{flex:1,padding:'10px',border:'none',borderRadius:12,fontWeight:800,fontSize:13,cursor:'pointer',background:tab===t?'linear-gradient(135deg,#c1121f,#e63946)':T.bg,color:tab===t?'#fff':T.text2}}>{t==='communities'?'🏘️ Communities':'📟 Devices'}</button>)}</div>
      <div style={{...cardStyle(),background:T.greenL,border:`1px solid ${T.green}30`}}><div style={{fontWeight:700,fontSize:13,color:T.green,marginBottom:8}}>📥 Download Template</div><button onClick={()=>import('xlsx').then(X=>{const ws=X.utils.json_to_sheet(tab==='communities'?[{'Block ID':'BLK-E','Block Name':'Block E','Location':'Waterford','Generation (kW)':120,'Consumption (kW)':95,'Devices':8}]:[{'Device ID (SFDI)':'SM-E001','Long Form ID (LFDI)':'LFDI-SM-E001','Device Type':'Smart Meter','Block ID':'BLK-A','Real Power (W)':1400,'Voltage (V)':230}]);const wb=X.utils.book_new();X.utils.book_append_sheet(wb,ws,tab);X.writeFile(wb,`vcg_${tab}_template.xlsx`)})} style={ironBtn()}>⬇️ Download Template</button></div>
      <div style={cardStyle()}><div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:12}}>📤 Upload File</div><label style={{display:'block',border:`2px dashed ${fileName?T.red:T.border}`,borderRadius:16,padding:'28px 20px',textAlign:'center',cursor:'pointer',background:fileName?T.redLight:T.bg}}><input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>{if(e.target.files?.[0]) readExcel(e.target.files[0])}}/><div style={{fontSize:36,marginBottom:8}}>{fileName?'📗':'📂'}</div>{fileName?<><div style={{fontWeight:800,fontSize:14,color:T.red}}>{fileName}</div><div style={{fontSize:11,color:T.text2,marginTop:4}}>{preview.length} rows</div></>:<><div style={{fontWeight:700,fontSize:14,color:T.text}}>Tap to choose file</div><div style={{fontSize:11,color:T.text3,marginTop:4}}>.xlsx · .xls · .csv</div></>}</label>{error&&<div style={{marginTop:10,padding:'10px',background:'#fef2f2',borderRadius:10,fontSize:12,color:T.red}}>⚠️ {error}</div>}</div>
      {preview.length>0&&<div style={cardStyle({padding:0,overflow:'hidden'})}><div style={{padding:'14px 16px',fontWeight:700,fontSize:13,color:T.text}}>Preview ({preview.length} rows)</div><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}><thead><tr style={{background:'linear-gradient(135deg,#0d1117,#161b22)'}}>{Object.keys(preview[0]).map(k=><th key={k} style={{padding:'8px 10px',textAlign:'left',fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'rgba(255,255,255,0.8)',whiteSpace:'nowrap'}}>{k}</th>)}</tr></thead><tbody>{preview.map((row,i)=><tr key={i} style={{background:i%2===0?T.bg:T.card,borderBottom:`1px solid ${T.border}`}}>{Object.values(row).map((v:any,j)=><td key={j} style={{padding:'8px 10px',color:T.text,whiteSpace:'nowrap'}}>{String(v)}</td>)}</tr>)}</tbody></table></div></div>}
      {preview.length>0&&<button onClick={importData} style={ironBtn()}>📊 Import {preview.length} {tab==='communities'?'Communities':'Devices'}</button>}
      {success&&<div style={{padding:'14px',borderRadius:14,background:T.greenL,fontSize:14,fontWeight:800,color:T.green,textAlign:'center'}}>{success}</div>}
    </div>
  )
}


function SH({T,title}:{T:any;title:string}){return <div style={{fontWeight:800,fontSize:14,color:T.text,paddingLeft:4}}>{title}</div>}

// ── FEATURE 2: ARCHITECTURE DIAGRAM ──────────────────────────────────────────
function ArchitectureScreen({T,blocks,apiOnline,cardStyle,darkMode}:any) {
  const [activeNode,setActiveNode]=useState<string|null>(null)
  const nodes=[
    {id:'app',    x:160,y:20,  w:120,h:40,label:'VCG Web App',    sub:'Vercel · Next.js',     color:'#e63946',icon:'📱'},
    {id:'api',    x:160,y:110, w:120,h:40,label:'IEEE 2030.5 API', sub:'FastAPI · Render',      color:'#ffd60a',icon:'⚡'},
    {id:'fiware', x:20, y:200, w:110,h:40,label:'FIWARE Orion',   sub:'NGSI-v2 · Port 1026',  color:'#58c4dc',icon:'🔥'},
    {id:'influx', x:155,y:200, w:110,h:40,label:'InfluxDB',       sub:'Time-series · Port 8086',color:'#10b981',icon:'📊'},
    {id:'ids',    x:290,y:200, w:110,h:40,label:'IDS Connector',  sub:'Dataspace · Port 8181', color:'#8b5cf6',icon:'🔒'},
    {id:'grafana',x:20, y:290, w:110,h:40,label:'Grafana',        sub:'Dashboard · Port 3000', color:'#f97316',icon:'📈'},
    {id:'mongo',  x:155,y:290, w:110,h:40,label:'MongoDB',        sub:'OrionDB · Port 27017',  color:'#10b981',icon:'🗄️'},
    {id:'group12',x:290,y:290, w:110,h:40,label:'Group 12',       sub:'NGSI Data Exchange',    color:'#ec4899',icon:'🤝'},
  ]
  const edges=[
    {from:'app',   to:'api',     label:'REST/IEEE'},
    {from:'api',   to:'fiware',  label:'NGSI-v2'},
    {from:'api',   to:'influx',  label:'Time-series'},
    {from:'api',   to:'ids',     label:'IDS Protocol'},
    {from:'fiware',to:'mongo',   label:'Storage'},
    {from:'fiware',to:'grafana', label:'Metrics'},
    {from:'ids',   to:'group12', label:'Data Contract'},
  ]
  const getNodeCenter=(id:string)=>{
    const n=nodes.find(x=>x.id===id)
    if(!n) return {x:0,y:0}
    return {x:n.x+n.w/2, y:n.y+n.h/2}
  }
  const activeInfo:Record<string,string>={
    app:'VCG Web App deployed on Vercel. Built with Next.js + React. Connects to IEEE 2030.5 API on Render.',
    api:'FastAPI backend implementing IEEE 2030.5 standard. Endpoints: /edev, /dcap, /dr, /tm, /mup. Live on Render.',
    fiware:'FIWARE Orion Context Broker v3.10.1. Stores NGSI-v2 entities for all energy blocks. Runs on port 1026.',
    influx:'InfluxDB 2.7 time-series database. Stores energy readings with nanosecond precision. Bucket: energy_readings.',
    ids:'IDS Dataspace Connector. Enables secure data sharing between VCG and Group 12 using IDS protocols.',
    grafana:'Grafana dashboard visualizing real-time energy data from InfluxDB. Pre-configured with energy panels.',
    mongo:'MongoDB 4.4 backing store for FIWARE Orion. Persists all NGSI-v2 context entities.',
    group12:'Group 12 VCG system. Data exchanged via IDS Dataspace using NGSI format for cross-community energy sharing.',
  }
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{...cardStyle({background:'linear-gradient(135deg,#0d1117,#1a0505)',border:'none'})}}>
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:'#ffd60a',marginBottom:4}}>🏗️ System Architecture</div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'rgba(255,255,255,0.5)'}}>IEEE 2030.5 · FIWARE · IDS Dataspace — tap any component</div>
      </div>

      <div style={cardStyle({padding:16,overflow:'hidden'})}>
        <svg width="100%" viewBox="0 0 420 350" style={{display:'block',overflow:'visible'}}>
          <defs>
            <marker id="archArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M2 1L8 5L2 9" fill="none" stroke="rgba(255,214,10,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
            </marker>
          </defs>
          {/* Edges */}
          {edges.map((e,i)=>{
            const f=getNodeCenter(e.from), t=getNodeCenter(e.to)
            const mx=(f.x+t.x)/2, my=(f.y+t.y)/2
            return (
              <g key={i}>
                <path d={`M${f.x} ${f.y} Q${mx} ${my} ${t.x} ${t.y}`}
                  fill="none" stroke="rgba(255,214,10,0.25)" strokeWidth={1.5}
                  strokeDasharray="4,3" markerEnd="url(#archArrow)"/>
                <text x={mx} y={my-4} textAnchor="middle" fontSize="7"
                  fill="rgba(255,214,10,0.5)" fontFamily="Share Tech Mono,monospace">{e.label}</text>
              </g>
            )
          })}
          {/* Nodes */}
          {nodes.map(n=>(
            <g key={n.id} onClick={()=>setActiveNode(activeNode===n.id?null:n.id)} style={{cursor:'pointer'}}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={10}
                fill={activeNode===n.id?n.color+'40':n.color+'15'}
                stroke={activeNode===n.id?n.color:n.color+'60'}
                strokeWidth={activeNode===n.id?2:1.5}/>
              {activeNode===n.id&&<rect x={n.x-2} y={n.y-2} width={n.w+4} height={n.h+4} rx={12}
                fill="none" stroke={n.color} strokeWidth={1} opacity={0.4}
                strokeDasharray="3,3"/>}
              <text x={n.x+n.w/2} y={n.y+16} textAnchor="middle" fontSize="10"
                fontWeight="700" fill={activeNode===n.id?n.color:'#e0d0c0'}
                fontFamily="Plus Jakarta Sans,sans-serif">{n.icon} {n.label}</text>
              <text x={n.x+n.w/2} y={n.y+29} textAnchor="middle" fontSize="7.5"
                fill="rgba(255,255,255,0.4)" fontFamily="Share Tech Mono,monospace">{n.sub}</text>
            </g>
          ))}
          {/* API Online indicator */}
          <circle cx={220} cy={130} r={4} fill={apiOnline?'#10b981':'#e63946'}
            opacity={0.9}/>
          <text x={228} y={134} fontSize="7" fill={apiOnline?'#10b981':'#e63946'}
            fontFamily="Share Tech Mono,monospace">{apiOnline?'LIVE':'DOWN'}</text>
        </svg>
      </div>

      {/* Active node info */}
      {activeNode&&(
        <div style={cardStyle({border:`1px solid ${nodes.find(n=>n.id===activeNode)?.color}40`,background:darkMode?'rgba(19,24,31,0.95)':undefined})}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:nodes.find(n=>n.id===activeNode)?.color+'25',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>{nodes.find(n=>n.id===activeNode)?.icon}</div>
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:14,color:nodes.find(n=>n.id===activeNode)?.color,fontWeight:700}}>{nodes.find(n=>n.id===activeNode)?.label}</div>
          </div>
          <div style={{fontSize:13,color:T.text2,lineHeight:1.6}}>{activeInfo[activeNode]}</div>
        </div>
      )}

      {/* Legend */}
      <div style={cardStyle()}>
        <div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:12}}>Component Status</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          {[
            {label:'VCG Web App',   status:'Live on Vercel',   color:'#10b981'},
            {label:'IEEE 2030.5 API',status:'Live on Render',  color:'#10b981'},
            {label:'FIWARE Orion',  status:'Local (Docker)',   color:'#f59e0b'},
            {label:'InfluxDB',      status:'Local (Docker)',   color:'#f59e0b'},
            {label:'IDS Connector', status:'Local (Docker)',   color:'#f59e0b'},
            {label:'Grafana',       status:'Local (Docker)',   color:'#f59e0b'},
          ].map(s=>(
            <div key={s.label} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:T.bg,borderRadius:10,border:`1px solid ${T.border}`}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:s.color,flexShrink:0,boxShadow:`0 0 6px ${s.color}`}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:11,color:T.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.label}</div>
                <div style={{fontSize:9,color:T.text3}}>{s.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── FEATURE 2b: PDF REPORT GENERATOR ─────────────────────────────────────────
function ReportScreen({T,blocks,sensors,devices,history,weatherData,cardStyle,ironBtn}:any) {
  const [generating,setGenerating]=useState(false)
  const [preview,setPreview]=useState(false)
  const now=new Date()

  const generateReport=async()=>{
    setGenerating(true)
    try {
      const XLSX=await import('xlsx')
      // Create multi-sheet workbook as report
      const wb=XLSX.utils.book_new()

      // Sheet 1: Executive Summary
      const summary=[
        ['VCG PROJECT REPORT','','',''],
        ['Virtual Communication Gateway — IEEE 2030.5','','',''],
        [`Generated: ${now.toLocaleString()}`,'','',''],
        ['Student: Ronit · ID: MI6228 · Group 13','','',''],
        ['Mentor: Paolo Cammardella','','',''],
        ['','','',''],
        ['SYSTEM OVERVIEW','','',''],
        ['Total Communities',blocks.length,'',''],
        ['Total Devices',devices.length,'',''],
        ['Total Generation (kW)',blocks.reduce((s:number,b:any)=>s+b.generation,0).toFixed(1),'',''],
        ['Total Consumption (kW)',blocks.reduce((s:number,b:any)=>s+b.consumption,0).toFixed(1),'',''],
        ['Net Balance (kW)',(blocks.reduce((s:number,b:any)=>s+b.generation,0)-blocks.reduce((s:number,b:any)=>s+b.consumption,0)).toFixed(1),'',''],
        ['Surplus Blocks',blocks.filter((b:any)=>b.status==='Surplus').length,'',''],
        ['Deficit Blocks',blocks.filter((b:any)=>b.status==='Deficit').length,'',''],
        ['','','',''],
        ['TECH STACK','','',''],
        ['Frontend','Next.js + React on Vercel','',''],
        ['Backend','FastAPI + IEEE 2030.5 on Render','',''],
        ['IoT Platform','FIWARE Orion v3.10.1','',''],
        ['Time-series DB','InfluxDB 2.7','',''],
        ['Data Exchange','IDS Dataspace Connector','',''],
        ['Visualization','Grafana Dashboard','',''],
      ]
      const ws1=XLSX.utils.aoa_to_sheet(summary)
      XLSX.utils.book_append_sheet(wb,ws1,'Executive Summary')

      // Sheet 2: Block Data
      const blockData=[
        ['Block ID','Name','Location','Generation (kW)','Consumption (kW)','Net Balance (kW)','Status','Devices'],
        ...blocks.map((b:any)=>[b.id,b.name,b.location,b.generation.toFixed(1),b.consumption.toFixed(1),b.net.toFixed(1),b.status,b.devices])
      ]
      const ws2=XLSX.utils.aoa_to_sheet(blockData)
      XLSX.utils.book_append_sheet(wb,ws2,'Community Blocks')

      // Sheet 3: Sensor Data
      const sensorRows:any[]=[['Block','Sensor','Value','Unit']]
      blocks.forEach((b:any)=>{
        const s=sensors[b.id]||[]
        s.forEach((sensor:any)=>sensorRows.push([b.name,sensor.label,sensor.value,sensor.unit]))
      })
      const ws3=XLSX.utils.aoa_to_sheet(sensorRows)
      XLSX.utils.book_append_sheet(wb,ws3,'Sensor Readings')

      // Sheet 4: Device Registry
      const deviceData=[
        ['SFDI','LFDI','Type','Block','Status','Power (W)','Voltage (V)','Last Seen'],
        ...devices.map((d:any)=>[d.sfdi,d.lfdi||'',d.type,d.block,d.status,d.power||'',d.voltage||'',d.lastSeen||''])
      ]
      const ws4=XLSX.utils.aoa_to_sheet(deviceData)
      XLSX.utils.book_append_sheet(wb,ws4,'Device Registry')

      // Sheet 5: Energy History
      const allHistory:any[]=[['Time','Block','Generation (kW)','Consumption (kW)','Net (kW)','Cost (€)']]
      Object.values(history).flat().slice(-50).forEach((h:any)=>{
        allHistory.push([h.time,h.block,h.generation,h.consumption,h.net,h.cost])
      })
      const ws5=XLSX.utils.aoa_to_sheet(allHistory)
      XLSX.utils.book_append_sheet(wb,ws5,'Energy History')

      // Sheet 6: Weather (if available)
      if(Object.keys(weatherData).length>0){
        const weatherRows=[
          ['City','Temperature (°C)','Wind Speed (km/h)','Humidity (%)','Solar Irradiance (W/m²)','Description'],
          ...Object.values(weatherData).map((w:any)=>[w.city,w.temp,w.windSpeed,w.humidity,w.solar,w.desc])
        ]
        const ws6=XLSX.utils.aoa_to_sheet(weatherRows)
        XLSX.utils.book_append_sheet(wb,ws6,'Weather Data')
      }

      XLSX.writeFile(wb,`VCG_Report_MI6228_${now.toISOString().slice(0,10)}.xlsx`)
      setPreview(true)
    } catch(e) { console.error(e) }
    setGenerating(false)
  }

  const totalGen=blocks.reduce((s:number,b:any)=>s+b.generation,0)
  const totalCon=blocks.reduce((s:number,b:any)=>s+b.consumption,0)
  const totalNet=totalGen-totalCon

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{...cardStyle({background:'linear-gradient(135deg,#0d1117,#1a0505)',border:'none'})}}>
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:'#e63946',marginBottom:4}}>📄 Project Report</div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'rgba(255,255,255,0.5)'}}>Auto-generate full VCG project report</div>
      </div>

      {/* Report preview */}
      <div style={cardStyle({border:'1px solid rgba(255,214,10,0.2)'})}>
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:14,color:T.gold,marginBottom:16,textAlign:'center',letterSpacing:2}}>VCG PROJECT REPORT</div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:T.text2,textAlign:'center',marginBottom:20}}>
          Virtual Communication Gateway · IEEE 2030.5<br/>
          MI6228 · Group 13 · {now.toLocaleDateString()}
        </div>

        {/* Stats grid */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
          {[
            {icon:'🏘️',label:'Communities',value:blocks.length,color:T.gold},
            {icon:'📟',label:'Devices',value:devices.length,color:T.arc},
            {icon:'⚡',label:'Total Gen',value:totalGen.toFixed(1)+' kW',color:'#10b981'},
            {icon:'🔌',label:'Total Con',value:totalCon.toFixed(1)+' kW',color:'#f59e0b'},
            {icon:'📊',label:'Net Balance',value:(totalNet>=0?'+':'')+totalNet.toFixed(1)+' kW',color:totalNet>=0?'#10b981':'#e63946'},
            {icon:'🌿',label:'CO₂ Saved',value:Object.values(sensors).flat().filter((s:any)=>s.label==='CO₂ Saved').reduce((t:number,s:any)=>t+s.value,0).toFixed(1)+' kg',color:'#10b981'},
          ].map(s=>(
            <div key={s.label} style={{background:T.bg,borderRadius:12,padding:'10px 12px',border:`1px solid ${T.border}`}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:18}}>{s.icon}</span>
                <div>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:14,fontWeight:700,color:s.color}}>{s.value}</div>
                  <div style={{fontSize:10,color:T.text3}}>{s.label}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Report contents */}
        <div style={{background:T.bg,borderRadius:12,padding:'12px 14px',marginBottom:16,border:`1px solid ${T.border}`}}>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3,marginBottom:10,letterSpacing:1}}>REPORT CONTAINS (6 SHEETS)</div>
          {[
            {icon:'📋',sheet:'Executive Summary',desc:'System overview, tech stack, KPIs'},
            {icon:'🏘️',sheet:'Community Blocks',desc:`${blocks.length} blocks with generation/consumption data`},
            {icon:'🌡️',sheet:'Sensor Readings',desc:'All 8 sensors per block'},
            {icon:'📟',sheet:'Device Registry',desc:`${devices.length} IEEE 2030.5 devices`},
            {icon:'📈',sheet:'Energy History',desc:'Last 50 energy readings'},
            {icon:'🌤️',sheet:'Weather Data',desc:Object.keys(weatherData).length>0?'Live weather for all cities':'Not available (API offline)'},
          ].map((s,i)=>(
            <div key={s.sheet} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:i<5?`1px solid ${T.border}`:'none'}}>
              <span style={{fontSize:16}}>{s.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:12,color:T.text}}>{s.sheet}</div>
                <div style={{fontSize:10,color:T.text3}}>{s.desc}</div>
              </div>
              <div style={{width:6,height:6,borderRadius:'50%',background:'#10b981'}}/>
            </div>
          ))}
        </div>

        <button onClick={generateReport} disabled={generating} style={ironBtn({})}>
          {generating
            ?<><div style={{width:16,height:16,border:'2px solid #fff',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>Generating Report...</>
            :'📥 Download Full Report (.xlsx)'}
        </button>
      </div>

      {preview&&(
        <div style={{padding:'14px 16px',borderRadius:14,background:'rgba(16,185,129,0.12)',border:'1px solid rgba(16,185,129,0.3)',fontSize:13,fontWeight:700,color:'#10b981',textAlign:'center'}}>
          ✅ Report downloaded! Check your Downloads folder.<br/>
          <span style={{fontSize:11,fontWeight:400,color:T.text2}}>VCG_Report_MI6228_{now.toISOString().slice(0,10)}.xlsx</span>
        </div>
      )}

      <div style={cardStyle({background:'rgba(255,214,10,0.05)',border:'1px solid rgba(255,214,10,0.2)'})}>
        <div style={{fontWeight:700,fontSize:13,color:T.gold,marginBottom:8}}>💡 Pro tip for Paolo</div>
        <div style={{fontSize:12,color:T.text2,lineHeight:1.6}}>Open the downloaded .xlsx in Excel or Google Sheets. Each tab contains a different section of the project. The Executive Summary tab gives a complete overview of the VCG system.</div>
      </div>
    </div>
  )
}

// ── FEATURE 4: PIN LOCK SCREEN ─────────────────────────────────────────────────
function PinScreen({onUnlock,savedPin}:{onUnlock:()=>void;savedPin:string}) {
  const [pin,setPin]=useState('')
  const [error,setError]=useState(false)
  const [shake,setShake]=useState(false)

  const handleDigit=(d:string)=>{
    if(pin.length>=4) return
    const newPin=pin+d
    setPin(newPin)
    if(newPin.length===4){
      if(newPin===savedPin){
        onUnlock()
      } else {
        setError(true); setShake(true)
        setTimeout(()=>{setPin('');setError(false);setShake(false)},600)
      }
    }
  }

  return (
    <div style={{position:'fixed',inset:0,background:'#0a0c10',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',fontFamily:'Plus Jakarta Sans,sans-serif',zIndex:9999}}>
      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>

      {/* Arc reactor */}
      <div style={{width:70,height:70,borderRadius:'50%',background:'radial-gradient(circle,#58c4dc,#0d4f6e)',border:'2px solid #58c4dc',display:'flex',alignItems:'center',justifyContent:'center',fontSize:30,marginBottom:24,boxShadow:'0 0 30px rgba(88,196,220,0.5)'}}>⚡</div>

      <div style={{fontFamily:"'Orbitron',monospace",fontSize:20,fontWeight:900,color:'#fff',letterSpacing:3,marginBottom:6}}>VCG PORTAL</div>
      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'rgba(255,214,10,0.6)',letterSpacing:2,marginBottom:40}}>ENTER PIN TO ACCESS</div>

      {/* PIN dots */}
      <div style={{display:'flex',gap:16,marginBottom:40,animation:shake?'shake 0.5s ease':undefined}}>
        {[0,1,2,3].map(i=>(
          <div key={i} style={{width:18,height:18,borderRadius:'50%',
            background:pin.length>i?(error?'#e63946':'#ffd60a'):'transparent',
            border:`2px solid ${pin.length>i?(error?'#e63946':'#ffd60a'):'rgba(255,255,255,0.2)'}`,
            transition:'all 0.15s',
            boxShadow:pin.length>i?`0 0 12px ${error?'#e63946':'#ffd60a'}`:undefined}}/>
        ))}
      </div>

      {/* Keypad */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,maxWidth:240}}>
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d,i)=>(
          <button key={i} onClick={()=>d==='⌫'?setPin(p=>p.slice(0,-1)):d?handleDigit(d):null}
            disabled={!d}
            style={{height:60,borderRadius:14,border:'1px solid rgba(255,255,255,0.1)',
              background:d?'rgba(255,255,255,0.06)':'transparent',
              color:d==='⌫'?'#e63946':'#fff',
              fontSize:d==='⌫'?20:22,fontWeight:700,cursor:d?'pointer':'default',
              fontFamily:"'Orbitron',monospace",
              transition:'all 0.1s',
              opacity:d?1:0}}
            onMouseOver={e=>{if(d)(e.currentTarget.style.background='rgba(255,214,10,0.12)')}}
            onMouseOut={e=>{if(d)(e.currentTarget.style.background='rgba(255,255,255,0.06)')}}>
            {d}
          </button>
        ))}
      </div>

      {error&&<div style={{marginTop:20,fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:'#e63946',letterSpacing:2}}>INCORRECT PIN</div>}
    </div>
  )
}

// ── FEATURE 2: NGSI GROUP 12 IMPORT ──────────────────────────────────────────
function NGSIScreen({T,blocks,onBlocksImported,cardStyle,ironBtn}:any) {
  const [input,setInput]=useState('')
  const [orionUrl,setOrionUrl]=useState('')
  const [preview,setPreview]=useState<Block[]>([])
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  const [tab,setTab]=useState<'paste'|'url'>('paste')

  const COLORS=['#58c4dc','#ec4899','#8b5cf6','#f97316','#10b981','#3b82f6']
  const EMOJIS=['🏘️','🌆','🌉','🏚️','🌃','🏗️']

  const parseNGSI=(data:any[]):Block[]=>{
    return data.filter((e:any)=>e.type==='EnergyBlock'||e.type==='EnergyMeter'||e.generation||e.consumption).map((e:any,i:number)=>{
      const gen=parseFloat(e.generation?.value||e.generation||100)
      const con=parseFloat(e.consumption?.value||e.consumption||80)
      const net=+(gen-con).toFixed(1)
      const idx=blocks.length+i
      return {
        id: e.id?.split(':').pop()||`EXT-${i+1}`,
        name: e.name?.value||e.name||`Group 12 Block ${i+1}`,
        location: e.location?.value||e.location||'External',
        emoji: EMOJIS[i%EMOJIS.length],
        generation: gen, consumption: con, net,
        status: net>0.5?'Surplus':net<-0.5?'Deficit':'Balanced',
        devices: parseInt(e.devices?.value||e.numDevices||'0'),
        color: COLORS[i%COLORS.length],
        lat: parseFloat(e.lat||e.latitude?.value||53.3),
        lng: parseFloat(e.lng||e.longitude?.value||-7.5),
      }
    })
  }

  const handlePaste=()=>{
    setError('');setPreview([])
    try{
      const data=JSON.parse(input)
      const arr=Array.isArray(data)?data:[data]
      const parsed=parseNGSI(arr)
      if(!parsed.length){setError('No valid EnergyBlock entities found in JSON');return}
      setPreview(parsed)
    }catch{setError('Invalid JSON — please check the format')}
  }

  const fetchFromOrion=async()=>{
    setError('');setPreview([]);setLoading(true)
    try{
      const r=await fetch(`${orionUrl}/v2/entities?type=EnergyBlock&limit=20`)
      if(!r.ok){setError(`Orion returned ${r.status}`);setLoading(false);return}
      const data=await r.json()
      if(!data.length){setError('No EnergyBlock entities found in Orion');setLoading(false);return}
      setPreview(parseNGSI(data))
    }catch{setError('Cannot reach Orion broker — check URL and CORS')}
    setLoading(false)
  }

  const SAMPLE_NGSI=`[
  {
    "id": "urn:ngsi-ld:EnergyBlock:G12-BlockA",
    "type": "EnergyBlock",
    "name": { "value": "G12 Block A" },
    "location": { "value": "Cork" },
    "generation": { "value": 132.5 },
    "consumption": { "value": 98.0 },
    "devices": { "value": 8 }
  }
]`

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{...cardStyle({background:'linear-gradient(135deg,#0d1117,#0a1628)',border:'none'})}}>
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:'#58c4dc',marginBottom:4}}>🔗 NGSI Import</div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'rgba(255,255,255,0.5)'}}>Import Group 12 data via NGSI-v2 format</div>
      </div>

      {/* Tab selector */}
      <div style={{display:'flex',gap:8,background:T.card,borderRadius:16,padding:8,boxShadow:'0 2px 10px rgba(0,0,0,0.1)'}}>
        {[{id:'paste',label:'📋 Paste JSON'},{id:'url',label:'🌐 Orion URL'}].map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id as any);setError('');setPreview([])}}
            style={{flex:1,padding:'10px',border:'none',borderRadius:12,fontWeight:800,fontSize:13,cursor:'pointer',
              background:tab===t.id?'linear-gradient(135deg,#0d4f6e,#58c4dc)':T.bg,
              color:tab===t.id?'#fff':T.text2}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==='paste'&&(
        <div style={cardStyle()}>
          <div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:8}}>Paste NGSI-v2 JSON from Group 12</div>
          <textarea value={input} onChange={e=>setInput(e.target.value)}
            placeholder={SAMPLE_NGSI}
            style={{width:'100%',height:180,padding:'12px',border:`1.5px solid ${T.border}`,borderRadius:12,
              fontSize:11,fontFamily:"'Share Tech Mono',monospace",color:T.text,background:T.bg,
              outline:'none',resize:'vertical',lineHeight:1.6}}/>
          <div style={{display:'flex',gap:8,marginTop:10}}>
            <button onClick={handlePaste} style={{...ironBtn({}),flex:1}}>🔍 Parse JSON</button>
            <button onClick={()=>setInput(SAMPLE_NGSI)} style={{background:T.arcLight,border:`1px solid ${T.arc}`,borderRadius:12,padding:'10px 14px',fontWeight:700,fontSize:12,color:T.arc,cursor:'pointer',whiteSpace:'nowrap'}}>Sample</button>
          </div>
        </div>
      )}

      {tab==='url'&&(
        <div style={cardStyle()}>
          <div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:8}}>Group 12 Orion Broker URL</div>
          <div style={{fontSize:12,color:T.text2,marginBottom:12}}>Ask Group 12 for their Orion URL and paste it here</div>
          <input value={orionUrl} onChange={e=>setOrionUrl(e.target.value)}
            placeholder="http://group12-orion.example.com:1026"
            style={{width:'100%',padding:'11px 14px',border:`1.5px solid ${T.border}`,borderRadius:12,
              fontSize:13,fontFamily:"'Share Tech Mono',monospace",color:T.text,background:T.bg,outline:'none',marginBottom:10}}/>
          <button onClick={fetchFromOrion} disabled={!orionUrl||loading} style={ironBtn({background:loading?T.text3:undefined})}>
            {loading?<><div style={{width:16,height:16,border:'2px solid #fff',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>Fetching...</>:'🌐 Fetch from Orion'}
          </button>
        </div>
      )}

      {error&&<div style={{padding:'12px 14px',borderRadius:12,background:'#fef2f2',border:'1px solid rgba(230,57,70,0.3)',fontSize:12,color:'#e63946',fontWeight:600}}>⚠️ {error}</div>}

      {/* Preview */}
      {preview.length>0&&(
        <>
          <div style={{fontWeight:800,fontSize:14,color:T.text,paddingLeft:4}}>Preview — {preview.length} block{preview.length>1?'s':''} found</div>
          {preview.map((b,i)=>(
            <div key={i} style={{...cardStyle(),borderLeft:`4px solid ${b.color}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <div style={{display:'flex',gap:10,alignItems:'center'}}>
                  <span style={{fontSize:24}}>{b.emoji}</span>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,color:T.text}}>{b.name}</div>
                    <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3}}>{b.id} · {b.location}</div>
                  </div>
                </div>
                <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,letterSpacing:1.5,padding:'3px 10px',borderRadius:20,background:b.status==='Surplus'?'rgba(16,185,129,0.2)':'rgba(230,57,70,0.2)',border:`1px solid ${b.status==='Surplus'?'#10b981':'#e63946'}60`,color:b.status==='Surplus'?'#10b981':'#e63946'}}>{b.status}</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                {[{l:'Gen',v:b.generation.toFixed(1),c:'#10b981'},{l:'Con',v:b.consumption.toFixed(1),c:'#f59e0b'},{l:'Net',v:(b.net>=0?'+':'')+b.net.toFixed(1),c:b.status==='Surplus'?'#10b981':'#e63946'}].map(s=>(
                  <div key={s.l} style={{background:T.bg,borderRadius:10,padding:'8px',textAlign:'center'}}>
                    <div style={{fontFamily:"'Orbitron',monospace",fontSize:14,fontWeight:700,color:s.c}}>{s.v}</div>
                    <div style={{fontSize:9,color:T.text3,marginTop:2}}>{s.l} kW</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button onClick={()=>onBlocksImported(preview)} style={ironBtn({background:'linear-gradient(135deg,#0d4f6e,#58c4dc)',boxShadow:'0 4px 16px rgba(88,196,220,0.4)'})}>
            ✅ Add {preview.length} Block{preview.length>1?'s':''} to Dashboard
          </button>
        </>
      )}

      {/* Info */}
      <div style={cardStyle({background:'rgba(88,196,220,0.05)',border:'1px solid rgba(88,196,220,0.2)'})}>
        <div style={{fontWeight:700,fontSize:13,color:T.arc,marginBottom:8}}>💡 How to get Group 12 data</div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {[
            '1. Ask Group 12 for their NGSI-v2 JSON export',
            '2. Or ask for their Orion broker URL',
            '3. Paste JSON or enter URL above',
            '4. Preview their blocks, then add to your dashboard',
            '5. Their data shows as new community blocks!'
          ].map(t=>(
            <div key={t} style={{fontSize:12,color:T.text2,display:'flex',gap:8}}>
              <span style={{color:T.arc,flexShrink:0}}>→</span>{t}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── UPDATE SETTINGS: Add PIN, Demo, Health Monitor ────────────────────────────
function SettingsScreen({T,apiOnline,apiMsg,onRefresh,onShowQR,onNavigate,onStartDemo,darkMode,onToggleDark,isOffline,cardStyle,ironBtn,goldBtn,pinLocked,savedPin,onPinChange,endpointHealth,canInstall,installed,onInstall}:any) {
  const [pinInput,setPinInput]=useState('')
  const [pinMode,setPinMode]=useState<'view'|'set'|'change'>('view')
  const [newPin,setNewPin]=useState('')
  const [confirmPin,setConfirmPin]=useState('')
  const [pinMsg,setPinMsg]=useState('')

  const savePin=()=>{
    if(newPin.length!==4||!/^\d{4}$/.test(newPin)){setPinMsg('PIN must be 4 digits');return}
    if(newPin!==confirmPin){setPinMsg('PINs do not match');return}
    onPinChange(newPin);setPinMsg('✅ PIN set!');setPinMode('view');setNewPin('');setConfirmPin('')
    setTimeout(()=>setPinMsg(''),2000)
  }

  const MORE=[
    {icon:'🏗️',label:'Architecture', s:'architecture',c:'#ffd60a'},
    {icon:'📄',label:'PDF Report',   s:'report',      c:'#e63946'},
    {icon:'🎬',label:'Demo Mode',    s:'demo',        c:'#ffd60a'},
    {icon:'🤝',label:'Group 12 Data',s:'group12',     c:'#ec4899'},
    {icon:'🔥',label:'FIWARE',       s:'fiware',      c:'#58c4dc'},
    {icon:'🤖',label:'Simulator',    s:'simulator',   c:'#e63946'},
    {icon:'📟',label:'Devices',      s:'devices',     c:'#58c4dc'},
    {icon:'🏆',label:'Compare',      s:'compare',     c:'#ffd60a'},
    {icon:'🗺️',label:'Map',          s:'map',         c:'#10b981'},
    {icon:'➕',label:'Register',     s:'register',    c:'#e63946'},
    {icon:'📊',label:'Import Excel', s:'import',      c:'#10b981'},
  ]

  const ENDPOINTS=['/api/v1/edev','/api/v1/dr/events','/api/v1/readings','/api/v1/mup','/api/v1/dcap']

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      {/* More Features Grid */}
      <div style={{...cardStyle({background:'linear-gradient(135deg,#0d1117,#1a0505)',border:'1px solid rgba(255,214,10,0.15)'})}}>
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:14,color:'#ffd60a',marginBottom:14,letterSpacing:1}}>⚙️ More Features</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {MORE.map(item=>(
            <button key={item.s} onClick={()=>item.s==='demo'?onStartDemo():onNavigate(item.s)}
              style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',
                background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',
                borderRadius:14,cursor:'pointer',textAlign:'left' as const,transition:'all 0.15s'}}
              onMouseOver={e=>{e.currentTarget.style.background='rgba(255,255,255,0.12)';e.currentTarget.style.borderColor=item.c+'60'}}
              onMouseOut={e=>{e.currentTarget.style.background='rgba(255,255,255,0.05)';e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'}}>
              <div style={{width:36,height:36,borderRadius:10,background:item.c+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>{item.icon}</div>
              <span style={{fontWeight:700,fontSize:12,color:'#fff'}}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Profile */}
      <div style={{background:'linear-gradient(135deg,#0a0c10,#3d0808)',borderRadius:24,padding:24,color:'#fff',border:'1px solid rgba(230,57,70,0.3)',boxShadow:'0 8px 32px rgba(230,57,70,0.2)'}}>
        <div style={{width:56,height:56,borderRadius:18,background:'linear-gradient(135deg,#8b0000,#e63946)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,marginBottom:14,boxShadow:'0 4px 16px rgba(230,57,70,0.5)'}}>👨‍💻</div>
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:20,color:'#fff'}}>Ronit</div>
        <div style={{fontSize:12,color:'rgba(255,255,255,0.5)',marginTop:3}}>Virtual Communication Gateway</div>
        <div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}>
          {[{l:'Student',v:'MI6228'},{l:'Group',v:'13'},{l:'Mentor',v:'Paolo C.'},{l:'Protocol',v:'IEEE 2030.5'}].map(x=>(
            <div key={x.l} style={{background:'rgba(255,255,255,0.06)',borderRadius:10,padding:'6px 12px',border:'1px solid rgba(230,57,70,0.2)'}}>
              <div style={{fontSize:8,color:'rgba(255,255,255,0.4)',fontWeight:700,textTransform:'uppercase' as const,letterSpacing:1.2}}>{x.l}</div>
              <div style={{fontSize:13,fontWeight:800,color:'#ffd60a'}}>{x.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* API Health Monitor */}
      <div style={cardStyle()}>
        <div style={{fontWeight:800,fontSize:15,color:T.text,marginBottom:14,display:'flex',alignItems:'center',gap:8}}>
          <span>⏱️</span> API Health Monitor
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {ENDPOINTS.map(ep=>{
            const h=endpointHealth?.[ep]
            const color=!h?T.text3:h.status==='ok'?'#10b981':h.status==='checking'?'#f59e0b':'#e63946'
            return (
              <div key={ep} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:T.bg,borderRadius:12,border:`1px solid ${color}20`}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:color,boxShadow:`0 0 6px ${color}`,flexShrink:0}}/>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:T.text,flex:1}}>{ep}</span>
                {h?.status==='checking'&&<div style={{width:12,height:12,border:`2px solid ${color}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>}
                {h?.status==='ok'&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'#10b981'}}>{h.latency}ms ✓</span>}
                {h?.status==='error'&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'#e63946'}}>ERROR</span>}
                {!h&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3}}>NOT CHECKED</span>}
              </div>
            )
          })}
        </div>
        <button onClick={onRefresh} style={{...ironBtn({}),marginTop:12}}>↺ Check All Endpoints</button>
      </div>

      {/* PIN Lock */}
      <div style={cardStyle()}>
        <div style={{fontWeight:800,fontSize:15,color:T.text,marginBottom:14,display:'flex',alignItems:'center',gap:8}}>
          <span>🔐</span> PIN Lock
          <div style={{marginLeft:'auto',fontFamily:"'Share Tech Mono',monospace",fontSize:10,padding:'3px 10px',borderRadius:20,background:pinLocked&&savedPin?'rgba(16,185,129,0.2)':'rgba(230,57,70,0.2)',border:`1px solid ${pinLocked&&savedPin?'#10b981':'#e63946'}60`,color:pinLocked&&savedPin?'#10b981':'#e63946'}}>{pinLocked&&savedPin?'ENABLED':'DISABLED'}</div>
        </div>

        {pinMode==='view'&&(
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setPinMode('set')} style={{...ironBtn({}),flex:1,padding:'10px'}}>{savedPin?'Change PIN':'Set PIN'}</button>
            {savedPin&&<button onClick={()=>onPinChange('')} style={{background:'#fef2f2',border:'1px solid rgba(230,57,70,0.3)',borderRadius:12,padding:'10px 16px',fontWeight:700,fontSize:12,color:'#e63946',cursor:'pointer'}}>Remove</button>}
          </div>
        )}

        {pinMode==='set'&&(
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <input type="password" maxLength={4} placeholder="New PIN (4 digits)" value={newPin}
              onChange={e=>setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))}
              style={{padding:'11px 14px',border:`1.5px solid ${T.border}`,borderRadius:12,fontSize:18,fontFamily:"'Orbitron',monospace",color:T.text,background:T.bg,outline:'none',textAlign:'center',letterSpacing:8}}/>
            <input type="password" maxLength={4} placeholder="Confirm PIN" value={confirmPin}
              onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4))}
              style={{padding:'11px 14px',border:`1.5px solid ${T.border}`,borderRadius:12,fontSize:18,fontFamily:"'Orbitron',monospace",color:T.text,background:T.bg,outline:'none',textAlign:'center',letterSpacing:8}}/>
            <div style={{display:'flex',gap:8}}>
              <button onClick={savePin} style={{...ironBtn({}),flex:1}}>Save PIN</button>
              <button onClick={()=>{setPinMode('view');setNewPin('');setConfirmPin('');setPinMsg('')}} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:12,padding:'10px 16px',fontWeight:700,fontSize:12,color:T.text2,cursor:'pointer'}}>Cancel</button>
            </div>
            {pinMsg&&<div style={{fontSize:12,fontWeight:600,color:pinMsg.startsWith('✅')?'#10b981':'#e63946',textAlign:'center'}}>{pinMsg}</div>}
          </div>
        )}
      </div>

      {/* Theme + Appearance */}
      <div style={cardStyle()}>
        <div style={{fontWeight:800,fontSize:15,color:T.text,marginBottom:14}}>🎨 Appearance</div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',background:T.bg,borderRadius:14,border:`1px solid ${T.border}`}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:24}}>{darkMode?'🌙':'☀️'}</span>
            <div><div style={{fontWeight:700,fontSize:14,color:T.text}}>{darkMode?'Iron Man Dark':'Light Mode'}</div><div style={{fontSize:12,color:T.text2}}>Tap to switch theme</div></div>
          </div>
          <button onClick={onToggleDark} style={{background:darkMode?'linear-gradient(135deg,#8b0000,#e63946)':'linear-gradient(135deg,#b8860b,#ffd60a)',color:darkMode?'#fff':'#0d1117',border:'none',borderRadius:10,padding:'8px 16px',fontWeight:700,fontSize:12,cursor:'pointer'}}>
            {darkMode?'Go Light':'Go Dark'}
          </button>
        </div>
      </div>

      {/* PWA Install */}
      {(canInstall||installed)&&(
        <div style={cardStyle({border:`1px solid ${installed?'#10b98140':'#58c4dc40'}`})}>
          <div style={{fontWeight:800,fontSize:15,color:T.text,marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
            <span>📱</span> Install App
            {installed&&<div style={{marginLeft:'auto',fontFamily:"'Share Tech Mono',monospace",fontSize:10,padding:'3px 10px',borderRadius:20,background:'rgba(16,185,129,0.2)',border:'1px solid rgba(16,185,129,0.4)',color:'#10b981'}}>INSTALLED ✓</div>}
          </div>
          {!installed?(
            <div>
              <div style={{fontSize:12,color:T.text2,marginBottom:12}}>Install VCG Portal as a native app on your device. Works offline, loads instantly!</div>
              <button onClick={onInstall} style={{background:'linear-gradient(135deg,#0d4f6e,#58c4dc)',color:'#fff',border:'none',borderRadius:14,padding:'13px',fontWeight:800,fontSize:14,cursor:'pointer',width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:8,boxShadow:'0 4px 16px rgba(88,196,220,0.4)'}}>
                📲 Install on this device
              </button>
            </div>
          ):(
            <div style={{fontSize:13,color:'#10b981',fontWeight:600,textAlign:'center',padding:'8px 0'}}>✅ VCG Portal is installed on your device!</div>
          )}
        </div>
      )}

      {/* QR Share */}
      <div style={cardStyle()}>
        <div style={{fontWeight:800,fontSize:15,color:T.text,marginBottom:14}}>📲 Share App</div>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=88x88&data=https://vcg-webapp.vercel.app&color=c1121f&bgcolor=ffffff&qzone=1`} width={88} height={88} alt="QR" style={{borderRadius:12,border:'2px solid #e63946',boxShadow:'0 0 16px rgba(230,57,70,0.3)'}}/>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'#e63946',marginBottom:4}}>vcg-webapp.vercel.app</div>
            <div style={{fontSize:12,color:T.text2,marginBottom:10}}>Scan to open on any device</div>
            <button onClick={onShowQR} style={ironBtn({padding:'9px 16px',width:'auto',fontSize:12})}>📲 Full QR</button>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div style={cardStyle()}>
        <div style={{fontWeight:800,fontSize:15,color:T.text,marginBottom:14}}>🔗 Quick Links</div>
        {[{icon:'🚀',l:'Live API Docs',sub:'virtual-gateway.onrender.com/docs',href:'https://virtual-gateway.onrender.com/docs'},{icon:'💻',l:'GitHub',sub:'rt0181996/virtual-gateway',href:'https://github.com/rt0181996/virtual-gateway'},{icon:'📊',l:'Grafana',sub:'localhost:3000',href:'http://localhost:3000'},{icon:'🌐',l:'IDS Dataspace',sub:'localhost:8181',href:'http://localhost:8181'}].map((x,i)=>(
          <a key={x.l} href={x.href} target="_blank" rel="noopener" style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:i<3?`1px solid ${T.border}`:'none',textDecoration:'none'}}>
            <div style={{width:38,height:38,borderRadius:12,background:'rgba(230,57,70,0.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>{x.icon}</div>
            <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13,color:T.text}}>{x.l}</div><div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3}}>{x.sub}</div></div>
            <span style={{color:T.text3,fontSize:18}}>›</span>
          </a>
        ))}
      </div>
      <div style={{textAlign:'center',padding:8,fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3,letterSpacing:1.5}}>VCG v10.0 · IRON MAN EDITION ⚡</div>
    </div>
  )
}

// ── GROUP 12 DATA IMPORTER ────────────────────────────────────────────────────
function Group12Screen({T,onBack,onImport,cardStyle,ironBtn}:any) {
  const [file,setFile]=useState<File|null>(null)
  const [parsed,setParsed]=useState<any[]>([])
  const [preview,setPreview]=useState<{block:any;devices:any[];sensors:any[]}|null>(null)
  const [error,setError]=useState('')
  const [importing,setImporting]=useState(false)
  const [done,setDone]=useState(false)

  const SENSOR_MAP:Record<string,{label:string;icon:string;color:string;unit:string;maxVal:number}>={
    temperature:   {label:'Temperature',    icon:'🌡️',color:'#f97316',unit:'°C',   maxVal:50},
    humidity:      {label:'Humidity',       icon:'💧',color:'#3b82f6',unit:'%',    maxVal:100},
    co2:           {label:'CO₂ Level',      icon:'🌿',color:'#10b981',unit:'ppm',  maxVal:5000},
    illuminance:   {label:'Solar Irradiance',icon:'☀️',color:'#ffd60a',unit:'lux', maxVal:1000},
    batteryLevel:  {label:'Battery SOC',    icon:'🔋',color:'#10b981',unit:'%',    maxVal:100},
    pressure:      {label:'Air Pressure',   icon:'🌀',color:'#8b5cf6',unit:'hPa',  maxVal:1100},
    waterFlow:     {label:'Water Flow',     icon:'💧',color:'#06b6d4',unit:'L/min',maxVal:10000},
    motion:        {label:'Motion',         icon:'🏃',color:'#f59e0b',unit:'state',maxVal:1},
    doorState:     {label:'Door State',     icon:'🚪',color:'#6b7280',unit:'state',maxVal:1},
    energy:        {label:'Energy Meter',   icon:'⚡',color:'#ffd60a',unit:'kWh',  maxVal:200000},
  }

  const parseCSV=(text:string)=>{
    const lines=text.trim().split('\n')
    const headers=lines[0].split(',').map(h=>h.trim().replace(/\r/g,''))
    return lines.slice(1).map(line=>{
      const vals=line.split(',')
      const row:Record<string,string>={}
      headers.forEach((h,i)=>row[h]=(vals[i]||'').trim().replace(/\r/g,''))
      return row
    }).filter(r=>r['ngsi_id'])
  }

  const buildPreview=(rows:any[])=>{
    // Get latest value per device/property
    const latest:Record<string,any>={}
    rows.forEach(r=>{
      const key=`${r['ngsi_id']}__${r['ngsi_property']}`
      if(!latest[key]) latest[key]=r
    })
    const latestRows=Object.values(latest)

    // Get SmartMeter energy for generation/consumption
    const energyRows=latestRows.filter(r=>r['ngsi_property']==='energy')
    const totalEnergy=energyRows.reduce((s:number,r:any)=>s+parseFloat(r['value_only']||0),0)
    const generation=+(totalEnergy/1000).toFixed(1) // Convert kWh to kW approx
    const consumption=+(generation*0.75).toFixed(1) // Estimate consumption as 75% of generation
    const net=+(generation-consumption).toFixed(1)

    // Build sensors from all sensor readings
    const sensors:any[]=[]
    latestRows.forEach(r=>{
      const prop=r['ngsi_property']
      const map=SENSOR_MAP[prop]
      if(map&&prop!=='energy'){
        const val=parseFloat(r['value_only']||0)
        sensors.push({
          icon:map.icon,
          label:map.label,
          value:+val.toFixed(2),
          unit:map.unit,
          color:map.color,
          bar:Math.min(Math.round((val/map.maxVal)*100),100)
        })
      }
    })

    // Add energy sensor
    if(energyRows.length>0){
      const val=parseFloat(energyRows[0]['value_only']||0)
      sensors.push({icon:'⚡',label:'Energy Meter',value:+val.toFixed(0),unit:'kWh',color:'#ffd60a',bar:Math.min(Math.round(val/200000*100),100)})
    }

    // Build devices from unique device IDs
    const deviceIds=new Set(rows.map(r=>r['ngsi_id']))
    const devices:any[]=Array.from(deviceIds).map((id:any)=>{
      const row=rows.find(r=>r['ngsi_id']===id)
      return {
        sfdi:id.split(':').pop()||id,
        lfdi:id,
        type:row?.['ngsi_type']||'Sensor',
        block:'G12-BLK',
        status:'Online',
        power:0,
        voltage:0,
        lastSeen:row?.['created_at']||'Just imported'
      }
    })

    // Build block
    const block={
      id:'G12-BLK',
      name:'Group 12 Block',
      location:'External',
      emoji:'🤝',
      generation,
      consumption,
      net,
      status:net>0?'Surplus':'Deficit' as 'Surplus'|'Deficit',
      devices:devices.length,
      color:'#ec4899',
      lat:53.2707,
      lng:-9.0568,
    }

    return {block,devices,sensors}
  }

  const handleFile=(f:File)=>{
    setFile(f);setError('');setParsed([]);setPreview(null);setDone(false)
    const reader=new FileReader()
    reader.onload=e=>{
      try{
        const text=e.target?.result as string
        const rows=parseCSV(text)
        if(!rows.length){setError('No data found in file');return}
        setParsed(rows)
        const prev=buildPreview(rows)
        setPreview(prev)
      }catch(err){setError('Could not parse CSV file')}
    }
    reader.readAsText(f)
  }

  const handleImport=()=>{
    if(!preview) return
    setImporting(true)
    setTimeout(()=>{
      onImport(preview.block, preview.devices, preview.sensors)
      setImporting(false)
      setDone(true)
    },800)
  }

  const pill=(color:string,text:string)=>(
    <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,letterSpacing:1.5,
      padding:'3px 10px',borderRadius:20,textTransform:'uppercase' as const,
      background:color+'25',border:`1px solid ${color}60`,color}}>{text}</span>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      {/* Header */}
      <div style={{...cardStyle({background:'linear-gradient(135deg,#0d1117,#1a0520)',border:'none'})}}>
        <button onClick={onBack} style={{background:'rgba(255,255,255,0.1)',border:'none',
          borderRadius:10,padding:'6px 14px',color:'#fff',fontSize:12,fontWeight:700,
          cursor:'pointer',marginBottom:14}}>← Back</button>
        <div style={{fontFamily:"'Orbitron',monospace",fontSize:16,color:'#ec4899',marginBottom:4}}>🤝 Group 12 Data</div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'rgba(255,255,255,0.5)'}}>
          Import NGSI-LD sensor data from Group 12
        </div>
      </div>

      {/* What's in their data */}
      <div style={cardStyle({border:'1px solid rgba(236,72,153,0.2)'})}>
        <div style={{fontWeight:800,fontSize:13,color:T.text,marginBottom:12}}>📦 Group 12 Devices</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          {[
            {icon:'🌡️',label:'Temperature',    sub:'TemperatureSensor'},
            {icon:'💧',label:'Humidity',        sub:'HumiditySensor'},
            {icon:'⚡',label:'Smart Meter',     sub:'Energy readings'},
            {icon:'🔋',label:'Battery',         sub:'BatterySensor'},
            {icon:'☀️',label:'Light/Solar',     sub:'LightSensor'},
            {icon:'🌿',label:'CO₂',             sub:'CO2Sensor'},
            {icon:'🌀',label:'Pressure',        sub:'PressureSensor'},
            {icon:'💧',label:'Water Flow',      sub:'FlowSensor'},
            {icon:'🏃',label:'Motion',          sub:'MotionSensor'},
            {icon:'🚪',label:'Door State',      sub:'DoorSensor'},
          ].map(d=>(
            <div key={d.label} style={{display:'flex',alignItems:'center',gap:8,
              padding:'8px 10px',background:T.bg,borderRadius:10,border:`1px solid ${T.border}`}}>
              <span style={{fontSize:16}}>{d.icon}</span>
              <div>
                <div style={{fontWeight:700,fontSize:11,color:T.text}}>{d.label}</div>
                <div style={{fontSize:9,color:T.text3}}>{d.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upload */}
      <div style={cardStyle()}>
        <div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:12}}>📤 Upload Group 12 CSV</div>
        <label style={{display:'block',border:`2px dashed ${file?'#ec4899':T.border}`,
          borderRadius:16,padding:'28px 20px',textAlign:'center',cursor:'pointer',
          background:file?'rgba(236,72,153,0.05)':T.bg,transition:'all 0.2s'}}>
          <input type="file" accept=".csv" style={{display:'none'}}
            onChange={e=>{if(e.target.files?.[0]) handleFile(e.target.files[0])}}/>
          <div style={{fontSize:36,marginBottom:8}}>{file?'📗':'📂'}</div>
          {file
            ?<><div style={{fontWeight:800,fontSize:14,color:'#ec4899'}}>{file.name}</div>
               <div style={{fontSize:11,color:T.text2,marginTop:4}}>{parsed.length} rows loaded</div></>
            :<><div style={{fontWeight:700,fontSize:14,color:T.text}}>Tap to upload CSV</div>
               <div style={{fontSize:11,color:T.text3,marginTop:4}}>ngsi_processed_data.csv</div></>
          }
        </label>
        {error&&<div style={{marginTop:10,padding:'10px',background:'#fef2f2',
          borderRadius:10,fontSize:12,color:'#e63946'}}>⚠️ {error}</div>}
      </div>

      {/* Preview */}
      {preview&&(
        <>
          <div style={{fontWeight:800,fontSize:14,color:T.text,paddingLeft:4}}>
            Preview — Ready to import
          </div>

          {/* Block card */}
          <div style={{...cardStyle(),borderLeft:'4px solid #ec4899'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <div style={{display:'flex',gap:12,alignItems:'center'}}>
                <span style={{fontSize:32}}>🤝</span>
                <div>
                  <div style={{fontWeight:800,fontSize:16,color:T.text}}>{preview.block.name}</div>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:T.text3}}>
                    {preview.block.id} · {preview.block.devices} devices
                  </div>
                </div>
              </div>
              {pill(preview.block.net>=0?'#10b981':'#e63946', preview.block.status)}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
              {[
                {l:'Generation',v:preview.block.generation+' kW',c:'#10b981'},
                {l:'Consumption',v:preview.block.consumption+' kW',c:'#f59e0b'},
                {l:'Net Balance',v:(preview.block.net>=0?'+':'')+preview.block.net+' kW',c:preview.block.net>=0?'#10b981':'#e63946'},
              ].map(s=>(
                <div key={s.l} style={{background:T.bg,borderRadius:10,padding:'10px 6px',textAlign:'center',border:`1px solid ${T.border}`}}>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:14,fontWeight:700,color:s.c}}>{s.v}</div>
                  <div style={{fontSize:9,color:T.text3,marginTop:2}}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sensors */}
          <div style={{fontWeight:700,fontSize:13,color:T.text2,paddingLeft:4}}>
            {preview.sensors.length} Sensors
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {preview.sensors.map((s:any,i:number)=>(
              <div key={i} style={cardStyle({padding:'12px 14px'})}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                  <span style={{fontSize:18}}>{s.icon}</span>
                  <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,
                    color:T.text3,background:T.bg,padding:'2px 6px',borderRadius:6}}>{s.unit}</span>
                </div>
                <div style={{fontFamily:"'Orbitron',monospace",fontSize:20,fontWeight:700,
                  color:s.color,lineHeight:1,marginBottom:4}}>{s.value}</div>
                <div style={{fontSize:10,color:T.text2,marginBottom:6}}>{s.label}</div>
                <div style={{height:3,background:T.bg,borderRadius:2,overflow:'hidden'}}>
                  <div style={{height:'100%',width:Math.min(s.bar,100)+'%',
                    background:`linear-gradient(90deg,${s.color}60,${s.color})`,borderRadius:2}}/>
                </div>
              </div>
            ))}
          </div>

          {/* Devices */}
          <div style={{fontWeight:700,fontSize:13,color:T.text2,paddingLeft:4}}>
            {preview.devices.length} Devices
          </div>
          <div style={cardStyle({padding:0,overflow:'hidden'})}>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead>
                  <tr style={{background:'linear-gradient(135deg,#0d1117,#1a0520)'}}>
                    {['Device ID','Type','Status','Last Seen'].map(h=>(
                      <th key={h} style={{padding:'10px',textAlign:'left',
                        fontFamily:"'Share Tech Mono',monospace",fontSize:9,
                        color:'rgba(255,255,255,0.7)',letterSpacing:1}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.devices.map((d:any,i:number)=>(
                    <tr key={i} style={{background:i%2===0?T.bg:T.card,
                      borderBottom:`1px solid ${T.border}`}}>
                      <td style={{padding:'8px 10px',fontFamily:"'Share Tech Mono',monospace",
                        color:'#ec4899',fontSize:10}}>{d.sfdi}</td>
                      <td style={{padding:'8px 10px',color:T.text2}}>{d.type}</td>
                      <td style={{padding:'8px 10px'}}>
                        <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,
                          padding:'2px 8px',borderRadius:20,background:'rgba(16,185,129,0.2)',
                          border:'1px solid rgba(16,185,129,0.4)',color:'#10b981'}}>Online</span>
                      </td>
                      <td style={{padding:'8px 10px',fontFamily:"'Share Tech Mono',monospace",
                        fontSize:10,color:T.text3}}>{d.lastSeen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Import button */}
          {!done
            ?<button onClick={handleImport} disabled={importing}
              style={{background:'linear-gradient(135deg,#831843,#ec4899)',color:'#fff',
                border:'none',borderRadius:14,padding:'14px',fontWeight:800,fontSize:14,
                cursor:'pointer',width:'100%',display:'flex',alignItems:'center',
                justifyContent:'center',gap:8,
                boxShadow:'0 4px 20px rgba(236,72,153,0.4)'}}>
              {importing
                ?<><div style={{width:16,height:16,border:'2px solid #fff',
                    borderTopColor:'transparent',borderRadius:'50%',
                    animation:'spin 1s linear infinite'}}/>Importing...</>
                :`🤝 Import Group 12 Data (${preview.devices.length} devices, ${preview.sensors.length} sensors)`
              }
            </button>
            :<div style={{padding:'16px',borderRadius:14,
                background:'rgba(16,185,129,0.12)',
                border:'1px solid rgba(16,185,129,0.3)',
                fontSize:14,fontWeight:800,color:'#10b981',textAlign:'center'}}>
              ✅ Group 12 data imported! Check Home screen.
            </div>
          }
        </>
      )}

      {/* Info box */}
      <div style={cardStyle({background:'rgba(236,72,153,0.05)',
        border:'1px solid rgba(236,72,153,0.2)'})}>
        <div style={{fontWeight:700,fontSize:13,color:'#ec4899',marginBottom:8}}>
          💡 About this import
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {[
            'Uploads Group 12\'s NGSI-LD sensor data from their CSV export',
            'SmartMeter energy → mapped to Generation/Consumption kW',
            'All 10 sensors appear in their block detail view',
            'All 10 devices registered in your device registry',
            'Data persists in localStorage — survives page refresh',
            'Their block appears alongside yours on the Ireland map',
          ].map((t,i)=>(
            <div key={i} style={{display:'flex',gap:8,fontSize:12,color:T.text2}}>
              <span style={{color:'#ec4899',flexShrink:0}}>→</span>{t}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
