"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const CATEGORIES = ["Footing & Foundation", "Plinth Beams", "Roof Beams", "Columns", "Roof Slab", "Staircase Structure", "Masonry, Joining & Plastering", "Doors & Windows", "Flooring & Tiles", "Painting Material", "Master Labor & Services", "Miscellaneous"];
const UNITS = ["NOS", "BAG", "CFT", "SQFT", "LITER", "KG", "RFT", "%", "Lumbsum", "Meter", "Feet", "Inch", "Box", "Piece", "Milimeter", "CUM", "SQ/MT", "Matric Ton"];

const INITIAL_FORM = { 
  date: new Date().toISOString().split('T')[0], 
  materialName: '', category: CATEGORIES[0], unit: UNITS[0], 
  qty: '', rate: '', billableQty: '', billableRate: '' 
};

export default function TrackExpenditure() {
  const router = useRouter();
  
  // --- STATE ---
  const [user, setUser] = useState<any>(null); // Re-added strict user tracking
  const [userData, setUserData] = useState<any>(null);
  
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectBudget, setNewProjectBudget] = useState("");
  const [isClientView, setIsClientView] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState(INITIAL_FORM);
  const [isCreating, setIsCreating] = useState(false);

  // --- INITIALIZATION ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Fetch User Tier
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUserData(docSnap.data());
        }
        // Fetch Projects
        fetchProjects(currentUser.uid);
      } else {
        router.push('/dashboard');
      }
    });
    return () => unsubscribe();
  }, [router]);

  const fetchProjects = async (uid: string) => {
    try {
      const q = query(collection(db, "boq_projects"), where("userId", "==", uid));
      const querySnapshot = await getDocs(q);
      const fetchedProjects: any[] = [];
      querySnapshot.forEach((d) => fetchedProjects.push({ id: d.id, ...d.data() }));
      setProjects(fetchedProjects);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // LIVE REAL-TIME LISTENER
  useEffect(() => {
    if (!selectedProject) { 
      setExpenses([]); 
      return; 
    }
    const q = query(collection(db, "boq_projects", selectedProject.id, "expenses"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedExpenses: any[] = [];
      querySnapshot.forEach((d) => fetchedExpenses.push({ id: d.id, ...d.data() }));
      fetchedExpenses.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setExpenses(fetchedExpenses);
    }, (error) => {
      console.error("Live Sync Error:", error.message);
    });
    
    return () => unsubscribe();
  }, [selectedProject]);

  // --- ACTION HANDLERS ---
  const handleLogout = async () => {
    await signOut(auth);
    router.push('/dashboard');
  };

  const handleProjectSelect = (e: any) => {
    const val = e.target.value;
    if (val === "NEW_PROJECT") { 
      setSelectedProject(null); 
      setExpenses([]); 
      return; 
    }
    setSelectedProject(projects.find(p => p.id === val) || null);
  };

  const handleCreateStandaloneProject = async (e: any) => {
    e.preventDefault();
    if (!newProjectName.trim() || !user) {
      return alert("Please enter a Project Name.");
    }
    
    setIsCreating(true);
    try {
      const payload = { 
        userId: user.uid, 
        projectName: newProjectName.trim(), 
        grandTotal: Number(newProjectBudget) || 0, 
        isManualTracker: true, 
        createdAt: serverTimestamp() 
      };
      
      const docRef = await addDoc(collection(db, "boq_projects"), payload);
      const newProj = { id: docRef.id, ...payload };
      
      setProjects(prev => [...prev, newProj]);
      setSelectedProject(newProj);
      setNewProjectName("");
      setNewProjectBudget("");
    } catch (error) {
      console.error("Database Error:", error);
      alert("Database Error: Could not create project.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleSubmitExpense = async (e: any) => {
    e.preventDefault();
    if (!selectedProject) return;
    
    try {
      const actualAmount = Number(expenseForm.qty) * Number(expenseForm.rate);
      const billQty = isPremium && expenseForm.billableQty ? Number(expenseForm.billableQty) : Number(expenseForm.qty);
      const billRate = isPremium && expenseForm.billableRate ? Number(expenseForm.billableRate) : Number(expenseForm.rate);
      
      const expenseData = {
        ...expenseForm, 
        qty: Number(expenseForm.qty), 
        rate: Number(expenseForm.rate), 
        actualAmount: actualAmount,
        billableQty: billQty, 
        billableRate: billRate, 
        billableAmount: (billQty * billRate), 
        updatedAt: serverTimestamp()
      };
      
      if (editingId) {
        await updateDoc(doc(db, "boq_projects", selectedProject.id, "expenses", editingId), expenseData);
      } else {
        await addDoc(collection(db, "boq_projects", selectedProject.id, "expenses"), { ...expenseData, createdAt: serverTimestamp() });
      }
      
      setExpenseForm(INITIAL_FORM);
      setEditingId(null);
    } catch (error) {
      console.error("Error saving expense:", error);
      alert("Could not save expense.");
    }
  };

  const handleEdit = (exp: any) => {
    setExpenseForm({ 
      date: exp.date, materialName: exp.materialName, category: exp.category, unit: exp.unit, 
      qty: exp.qty, rate: exp.rate, billableQty: exp.billableQty, billableRate: exp.billableRate 
    });
    setEditingId(exp.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (expId: string) => {
    if (!confirm("Are you sure you want to delete this record?")) return;
    await deleteDoc(doc(db, "boq_projects", selectedProject.id, "expenses", expId));
  };

  // --- UI RENDERING ---
  if (isLoading) return <div className="min-h-screen flex items-center justify-center font-black text-2xl uppercase">Loading Tracker...</div>;

  const isPremium = userData?.tier === 'premium';
  const estimatedBudget = selectedProject?.grandTotal || 0;
  
  // Safe math calculations (prevents crashes from old data)
  const actualTotalSpent = expenses.reduce((sum, exp) => sum + (Number(exp.actualAmount) || 0), 0);
  const billableTotalSpent = expenses.reduce((sum, exp) => sum + (Number(exp.billableAmount) || 0), 0);

  const groupedExpenses = CATEGORIES.reduce((acc: any, cat) => {
    const items = expenses.filter(e => e.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  // === CLIENT INVOICE VIEW (PREMIUM) ===
  if (isClientView && selectedProject) {
    return (
      <main className="max-w-5xl mx-auto p-8 mt-10 bg-white border-4 border-black shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] print:shadow-none print:border-none print:p-0">
        <div className="flex justify-between items-end border-b-8 border-black pb-6 mb-8">
          <div>
            <h1 className="text-4xl font-black uppercase">Project Billing Summary</h1>
            <h2 className="text-xl font-bold text-gray-500 mt-2">{selectedProject.projectName}</h2>
          </div>
          <div className="text-right">
            <p className="text-sm font-black uppercase text-gray-500">Date Generated</p>
            <p className="text-lg font-bold">{new Date().toLocaleDateString()}</p>
          </div>
        </div>
        
        {Object.keys(groupedExpenses).map(cat => {
          const sectionTotal = groupedExpenses[cat].reduce((sum: number, exp: any) => sum + (Number(exp.billableAmount) || 0), 0);
          return (
            <div key={cat} className="mb-10 print:break-inside-avoid">
              <div className="bg-gray-100 p-2 border-l-8 border-[#22c55e] mb-4">
                <h3 className="font-black uppercase text-lg ml-2">{cat}</h3>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-black">
                    <th className="p-2 font-black text-xs uppercase">Date</th>
                    <th className="p-2 font-black text-xs uppercase">Material/Service</th>
                    <th className="p-2 font-black text-xs uppercase text-center">Unit</th>
                    <th className="p-2 font-black text-xs uppercase text-right">Qty</th>
                    <th className="p-2 font-black text-xs uppercase text-right">Rate</th>
                    <th className="p-2 font-black text-xs uppercase text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedExpenses[cat].map((exp: any) => (
                    <tr key={exp.id} className="border-b border-gray-300">
                      <td className="p-2 text-sm">{new Date(exp.date).toLocaleDateString()}</td>
                      <td className="p-2 text-sm font-bold">{exp.materialName}</td>
                      <td className="p-2 text-sm text-center">{exp.unit}</td>
                      <td className="p-2 text-sm text-right">{exp.billableQty || exp.qty}</td>
                      <td className="p-2 text-sm text-right">₹{(Number(exp.billableRate) || 0).toLocaleString()}</td>
                      <td className="p-2 text-sm font-black text-right">₹{(Number(exp.billableAmount) || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50">
                    <td colSpan={5} className="p-2 text-right font-black text-sm uppercase">Section Total:</td>
                    <td className="p-2 text-right font-black text-lg">₹{sectionTotal.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
        
        <div className="mt-12 bg-black text-white p-6 flex justify-between items-center print:break-inside-avoid">
          <span className="text-2xl font-black uppercase">Grand Total Due:</span>
          <span className="text-4xl font-black text-[#22c55e]">₹{billableTotalSpent.toLocaleString()}</span>
        </div>
        
        <div className="mt-10 flex gap-4 print:hidden">
          <button onClick={() => setIsClientView(false)} className="flex-1 border-4 border-black p-4 font-black uppercase hover:bg-gray-100">Back to Ledger</button>
          <button onClick={() => window.print()} className="flex-1 bg-[#22c55e] border-4 border-black p-4 font-black uppercase hover:bg-black hover:text-white transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">Download / Print Bill</button>
        </div>
      </main>
    );
  }

  // === MASTER TRACKING VIEW ===
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
      
      {/* 1. MASTER HEADER */}
      <header className="bg-black text-white border-b-4 border-black sticky top-0 z-50">
        {/* Header Bar */}
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-20 flex justify-between items-center bg-black relative z-50">
          
          {/* Logo */}
          <Link href="/dashboard" className="font-black text-2xl tracking-tighter cursor-pointer hover:opacity-80 transition-opacity">
            <span className="text-white">OKI</span><span className="text-[#22c55e]">CONSTRUCT</span>
          </Link>

          {/* Universal Menu Button (Visible on ALL screens) */}
          <button 
            className="flex items-center gap-2 text-white font-black text-xl hover:text-[#22c55e] transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <span className="text-sm tracking-widest uppercase hidden md:inline-block">Menu</span>
            <span className="text-2xl">{isMobileMenuOpen ? "✕" : "☰"}</span>
          </button>
        </div>

        {/* Universal Dropdown Drawer */}
        {isMobileMenuOpen && (
          <nav className="absolute top-full left-0 w-full bg-gray-900 border-b-4 border-black flex flex-col p-6 gap-4 animate-in slide-in-from-top-2 shadow-[0px_10px_0px_0px_rgba(0,0,0,1)] z-40">
            <div className="max-w-[1400px] mx-auto w-full flex flex-col gap-4">
              <Link href="/estimate-boq" className="font-black text-sm md:text-base uppercase hover:text-[#22c55e] border-b border-gray-800 pb-3 transition-colors">Estimate BOQ</Link>
              <Link href="/track-expenditure" className="font-black text-sm md:text-base uppercase hover:text-[#22c55e] border-b border-gray-800 pb-3 transition-colors">Track Expenditure</Link>
              <Link href="/contact-experts" className="font-black text-sm md:text-base uppercase hover:text-[#22c55e] border-b border-gray-800 pb-3 transition-colors">Contact Experts</Link>
              
              {isPremium && (
                <Link href="/custom-settings" className="font-black text-sm md:text-base uppercase text-[#22c55e] border-b border-gray-800 pb-3 hover:text-white transition-colors">
                  ⚙️ Custom Rates
                </Link>
              )}
              
              <Link href="/profile" className="font-black text-sm md:text-base uppercase text-gray-300 hover:text-white border-b border-gray-800 pb-3 transition-colors">My Profile</Link>
              
              <button onClick={handleLogout} className="font-black text-sm md:text-base uppercase text-red-500 text-left pt-2 hover:text-white transition-colors w-fit">
                Logout ➔
              </button>
            </div>
          </nav>
        )}
      </header>

      <main className="max-w-[1400px] mx-auto p-4 md:p-6 mt-10 w-full flex-grow">
        <div className="bg-white border-4 border-black p-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 border-b-8 border-black pb-6">
            <div>
              <h1 className="text-4xl font-black uppercase text-black">Project Ledger</h1>
              <p className="text-sm font-bold text-gray-500 tracking-widest mt-1">OKICONSTRUCT EXPENSE TRACKING</p>
            </div>
            <div className="mt-4 md:mt-0 w-full md:w-1/3">
              <select className="w-full border-4 border-black p-4 font-black text-xl bg-gray-50 hover:bg-gray-100 outline-none cursor-pointer" value={selectedProject ? selectedProject.id : ""} onChange={handleProjectSelect}>
                <option value="" disabled>-- SELECT A PROJECT --</option>
                <option value="NEW_PROJECT" className="font-black text-[#22c55e] bg-black">＋ CREATE NEW PROJECT</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.projectName}</option>)}
              </select>
            </div>
          </div>

          {!selectedProject ? (
            <div className="py-12 px-4 text-center animate-in fade-in zoom-in duration-300">
              <h2 className="text-3xl md:text-5xl font-black uppercase mb-4 text-black">Start Tracking</h2>
              <p className="text-lg font-bold text-gray-500 mb-10 max-w-2xl mx-auto">Select an existing project or create a brand new ledger to start tracking your expenses instantly.</p>
              
              <div className="max-w-md mx-auto bg-gray-50 border-4 border-black p-8 text-left shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="font-black text-xl uppercase mb-6 border-b-4 border-[#22c55e] pb-2 inline-block">Create Blank Project</h3>
                <form onSubmit={handleCreateStandaloneProject} className="space-y-6">
                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-gray-600">Project Name</label>
                    <input type="text" required placeholder="e.g. Smith Residence" className="w-full border-4 border-black p-3 font-bold mt-1 bg-white" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-gray-600">Overall Budget Limit (Optional)</label>
                    <input type="number" placeholder="0" className="w-full border-4 border-black p-3 font-bold mt-1 bg-white" value={newProjectBudget} onChange={e => setNewProjectBudget(e.target.value)} />
                  </div>
                  <button type="submit" disabled={isCreating} className={`w-full text-black border-4 border-black p-4 font-black uppercase text-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${isCreating ? 'bg-gray-400 opacity-70 cursor-not-allowed' : 'bg-[#22c55e] hover:bg-black hover:text-[#22c55e] hover:shadow-none hover:translate-y-1 transition-colors'}`}>
                    {isCreating ? "Creating Tracker..." : "Create & Open Ledger ➔"}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="space-y-10 animate-in fade-in duration-500">
              
              {/* THE DATA ENTRY ROW */}
              <div className="bg-gray-50 border-4 border-black p-6 print:hidden">
                <h2 className="font-black text-xl uppercase mb-4 text-[#22c55e] border-b-4 border-black inline-block pb-1">
                  {editingId ? "Update Entry" : "Add Expenditure"}
                </h2>
                
                <form onSubmit={handleSubmitExpense} className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                  <div className="lg:col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest">Date</label>
                    <input type="date" required className="w-full border-2 border-black p-2 font-bold cursor-pointer" value={expenseForm.date} onChange={e => setExpenseForm({...expenseForm, date: e.target.value})} />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="text-[10px] font-black uppercase tracking-widest">Material / Service</label>
                    <input type="text" required placeholder="e.g. Portland Cement" className="w-full border-2 border-black p-2 font-bold" value={expenseForm.materialName} onChange={e => setExpenseForm({...expenseForm, materialName: e.target.value})} />
                  </div>
                  <div className="lg:col-span-3">
                    <label className="text-[10px] font-black uppercase tracking-widest">Category</label>
                    <select className="w-full border-2 border-black p-2 font-bold bg-white cursor-pointer" value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest">Unit</label>
                    <select className="w-full border-2 border-black p-2 font-bold bg-white cursor-pointer" value={expenseForm.unit} onChange={e => setExpenseForm({...expenseForm, unit: e.target.value})}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>

                  <div className="col-span-full border-t-2 border-gray-300 my-2 lg:hidden"></div>

                  <div className="lg:col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-red-600">{isPremium ? 'Actual Qty' : 'Qty'}</label>
                    <input type="number" required inputMode="decimal" min="0" step="any" placeholder="0" className="w-full border-2 border-black p-2 font-black text-red-600" value={expenseForm.qty} onChange={e => setExpenseForm({...expenseForm, qty: e.target.value})} />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-red-600">{isPremium ? 'Actual Rate' : 'Rate'}</label>
                    <input type="number" required inputMode="decimal" min="0" step="any" placeholder="0" className="w-full border-2 border-black p-2 font-black text-red-600" value={expenseForm.rate} onChange={e => setExpenseForm({...expenseForm, rate: e.target.value})} />
                  </div>

                  {isPremium && (
                    <>
                      <div className="lg:col-span-2 bg-[#22c55e]/10 p-2 border-2 border-black">
                        <label className="text-[10px] font-black uppercase text-[#22c55e]">Billable Qty</label>
                        <input type="number" inputMode="decimal" min="0" step="any" placeholder="Auto" className="w-full border-2 border-black p-1 font-black bg-white" value={expenseForm.billableQty} onChange={e => setExpenseForm({...expenseForm, billableQty: e.target.value})} />
                      </div>
                      <div className="lg:col-span-2 bg-[#22c55e]/10 p-2 border-2 border-black">
                        <label className="text-[10px] font-black uppercase text-[#22c55e]">Billable Rate</label>
                        <input type="number" inputMode="decimal" min="0" step="any" placeholder="Auto" className="w-full border-2 border-black p-1 font-black bg-white" value={expenseForm.billableRate} onChange={e => setExpenseForm({...expenseForm, billableRate: e.target.value})} />
                      </div>
                    </>
                  )}

                  <div className="lg:col-span-2">
                    <button type="submit" className={`w-full text-white border-4 border-black p-3 font-black uppercase transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-1 ${editingId ? 'bg-blue-600' : 'bg-black hover:bg-[#22c55e] hover:text-black'}`}>
                      {editingId ? 'Save' : 'ADD +'}
                    </button>
                    {editingId && (
                      <button type="button" onClick={() => {setEditingId(null); setExpenseForm(INITIAL_FORM)}} className="w-full mt-2 text-xs font-black uppercase text-gray-500 hover:text-black">Cancel</button>
                    )}
                  </div>
                </form>
              </div>

              {/* FINANCIAL SUMMARY */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="border-4 border-black p-6 bg-gray-100 flex flex-col justify-center">
                  <span className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Project Estimate Limit</span>
                  <span className="text-3xl font-black">₹{estimatedBudget.toLocaleString()}</span>
                </div>
                <div className="border-4 border-black p-6 bg-black text-white flex flex-col justify-center shadow-[6px_6px_0px_0px_rgba(220,38,38,1)]">
                  <span className="text-xs font-black uppercase tracking-widest text-gray-400 mb-1">Actual Expenditure</span>
                  <span className="text-4xl font-black text-red-500">₹{actualTotalSpent.toLocaleString()}</span>
                </div>
                {isPremium ? (
                  <div className="border-4 border-black p-6 bg-[#22c55e] text-black flex flex-col justify-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
                    <span className="text-xs font-black uppercase tracking-widest text-black/70 mb-1">Client Billable Total</span>
                    <span className="text-4xl font-black text-white">₹{billableTotalSpent.toLocaleString()}</span>
                    <span className="text-xs font-black mt-2 bg-black text-white px-2 py-1 inline-block w-fit">
                      PROFIT MARGIN: ₹{(billableTotalSpent - actualTotalSpent).toLocaleString()}
                    </span>
                  </div>
                ) : (
                  <div className="border-4 border-black p-6 bg-white flex flex-col justify-center">
                    <span className="text-xs font-black uppercase tracking-widest text-gray-500 mb-1">Budget Remaining</span>
                    <span className={`text-3xl font-black ${estimatedBudget - actualTotalSpent < 0 ? 'text-red-600' : 'text-[#22c55e]'}`}>
                      ₹{(estimatedBudget - actualTotalSpent).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-4 print:hidden">
                <button onClick={() => window.print()} className="bg-white text-black border-4 border-black px-6 py-3 font-black uppercase hover:bg-gray-100 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-1">
                  Print Ledger
                </button>
                {isPremium && (
                  <button onClick={() => setIsClientView(true)} className="bg-black text-[#22c55e] border-4 border-black px-6 py-3 font-black uppercase hover:bg-[#22c55e] hover:text-black transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-y-1">
                    Preview Client Bill ➔
                  </button>
                )}
              </div>

              {/* TABLE */}
              <div className="mt-10 overflow-x-auto border-4 border-black bg-white">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-black text-white">
                      <th className="p-3 font-black text-xs uppercase border-r-2 border-gray-600">Date</th>
                      <th className="p-3 font-black text-xs uppercase border-r-2 border-gray-600">Material</th>
                      <th className="p-3 font-black text-xs uppercase border-r-2 border-gray-600 text-center">Unit</th>
                      <th className="p-3 font-black text-xs uppercase text-right bg-red-900 border-r border-red-950">{isPremium ? 'Act Qty' : 'Qty'}</th>
                      <th className="p-3 font-black text-xs uppercase text-right bg-red-900 border-r border-red-950">{isPremium ? 'Act Rate' : 'Rate'}</th>
                      <th className="p-3 font-black text-xs uppercase text-right bg-red-900 border-r-2 border-black">{isPremium ? 'Act Amount' : 'Amount'}</th>
                      
                      {isPremium && (
                        <>
                          <th className="p-3 font-black text-xs uppercase text-right bg-green-900 border-r border-green-950 text-[#22c55e]">Bill Qty</th>
                          <th className="p-3 font-black text-xs uppercase text-right bg-green-900 border-r border-green-950 text-[#22c55e]">Bill Rate</th>
                          <th className="p-3 font-black text-xs uppercase text-right bg-green-900 border-r-2 border-black text-[#22c55e]">Bill Amount</th>
                        </>
                      )}
                      <th className="p-3 font-black text-xs uppercase text-center print:hidden">Actions</th>
                    </tr>
                  </thead>
                  
                  {Object.keys(groupedExpenses).length === 0 ? (
                    <tbody>
                      <tr>
                        <td colSpan={10} className="p-20 text-center font-black uppercase text-gray-400 text-xl tracking-widest">
                          No expenses logged yet. Fill out the form above!
                        </td>
                      </tr>
                    </tbody>
                  ) : (
                    Object.keys(groupedExpenses).map(cat => {
                      const secActual = groupedExpenses[cat].reduce((sum: number, exp: any) => sum + (Number(exp.actualAmount) || 0), 0);
                      const secBillable = groupedExpenses[cat].reduce((sum: number, exp: any) => sum + (Number(exp.billableAmount) || 0), 0);
                      
                      return (
                        <tbody key={cat}>
                          <tr className="bg-gray-200 border-y-4 border-black">
                            <td colSpan={10} className="p-2 font-black text-sm uppercase text-black bg-[#22c55e] border-b-2 border-black">{cat}</td>
                          </tr>
                          
                          {groupedExpenses[cat].map((exp: any) => (
                            <tr key={exp.id} className="border-b-2 border-gray-300 hover:bg-gray-50">
                              <td className="p-2 text-sm font-bold border-r-2 border-gray-200 whitespace-nowrap">{exp.date}</td>
                              <td className="p-2 text-sm font-bold border-r-2 border-gray-200">{exp.materialName}</td>
                              <td className="p-2 text-sm font-bold border-r-2 border-gray-200 text-center">{exp.unit}</td>
                              <td className="p-2 text-sm font-bold text-right text-red-600 bg-red-50/50">{exp.qty}</td>
                              <td className="p-2 text-sm font-bold text-right text-red-600 bg-red-50/50">₹{(Number(exp.rate) || 0).toLocaleString()}</td>
                              <td className="p-2 text-sm font-black text-right text-red-700 bg-red-50/50 border-r-2 border-gray-300">₹{(Number(exp.actualAmount) || 0).toLocaleString()}</td>
                              
                              {isPremium && (
                                <>
                                  <td className="p-2 text-sm font-bold text-right text-green-700 bg-green-50/50">{exp.billableQty || exp.qty}</td>
                                  <td className="p-2 text-sm font-bold text-right text-green-700 bg-green-50/50">₹{(Number(exp.billableRate) || 0).toLocaleString()}</td>
                                  <td className="p-2 text-sm font-black text-right text-green-800 bg-green-50/50 border-r-2 border-gray-300">₹{(Number(exp.billableAmount) || 0).toLocaleString()}</td>
                                </>
                              )}
                              
                              <td className="p-2 text-center print:hidden">
                                <button onClick={() => handleEdit(exp)} className="bg-black text-white px-3 py-1 text-xs font-black uppercase hover:bg-blue-600 transition-colors mr-2">Edit</button>
                                <button onClick={() => handleDelete(exp.id)} className="bg-white text-red-600 border-2 border-red-600 px-3 py-1 text-xs font-black uppercase hover:bg-red-600 hover:text-white transition-colors">X</button>
                              </td>
                            </tr>
                          ))}
                          
                          <tr className="bg-gray-100 border-b-4 border-black">
                            <td colSpan={5} className="p-2 text-right font-black text-xs uppercase">Subtotal:</td>
                            <td className="p-2 text-right font-black text-red-600">₹{secActual.toLocaleString()}</td>
                            {isPremium && (
                              <>
                                <td colSpan={2}></td>
                                <td className="p-2 text-right font-black text-[#22c55e]">₹{secBillable.toLocaleString()}</td>
                              </>
                            )}
                            <td className="print:hidden"></td>
                          </tr>
                        </tbody>
                      );
                    })
                  )}
                  
                  {expenses.length > 0 && (
                    <tfoot>
                      <tr className="bg-black text-white border-4 border-black">
                        <td colSpan={5} className="p-4 text-right font-black text-lg uppercase">Grand Total:</td>
                        <td className="p-4 text-right font-black text-xl text-red-500">₹{actualTotalSpent.toLocaleString()}</td>
                        {isPremium && (
                          <>
                            <td colSpan={2}></td>
                            <td className="p-4 text-right font-black text-xl text-[#22c55e]">₹{billableTotalSpent.toLocaleString()}</td>
                          </>
                        )}
                        <td className="print:hidden"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}