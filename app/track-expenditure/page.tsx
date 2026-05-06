"use client";
import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../components/Navbar';

const CATEGORIES = ["Footing & Foundation", "Plinth Beams", "Roof Beams", "Columns", "Roof Slab", "Staircase Structure", "Masonry, Joining & Plastering", "Doors & Windows", "Flooring & Tiles", "Painting Material", "Master Labor & Services", "Miscellaneous"]; //[cite: 4]
const UNITS = ["NOS", "BAG", "CFT", "SQFT", "LITER", "KG", "RFT", "%", "Lumbsum", "Meter", "Feet", "Inch", "Box", "Piece", "Milimeter", "CUM", "SQ/MT", "Matric Ton"]; //[cite: 4]

const INITIAL_FORM = { 
  date: new Date().toISOString().split('T')[0], 
  materialName: '', category: CATEGORIES[0], unit: UNITS[0], 
  qty: '', rate: '', billableQty: '', billableRate: '' 
}; //[cite: 4]

export default function TrackExpenditure() {
  const router = useRouter();
  
  const [user, setUser] = useState<any>(null); 
  const [userData, setUserData] = useState<any>(null);
  
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectBudget, setNewProjectBudget] = useState("");
  const [isClientView, setIsClientView] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState(INITIAL_FORM);
  const [isCreating, setIsCreating] = useState(false); //[cite: 4]

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setUserData(docSnap.data());
        }
        fetchProjects(currentUser.uid);
      } else {
        router.push('/');
      }
    });
    return () => unsubscribe();
  }, [router]); //[cite: 4]

  const fetchProjects = async (uid: string) => {
    try {
      // Changed "userId" to "uid" to match your Firestore security rules
      const q = query(collection(db, "boq_projects"), where("uid", "==", uid)); //[cite: 4]
      const querySnapshot = await getDocs(q);
      const fetchedProjects: any[] = [];
      querySnapshot.forEach((d) => fetchedProjects.push({ id: d.id, ...d.data() }));
      setProjects(fetchedProjects);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setIsLoading(false);
    }
  }; //[cite: 4]

  useEffect(() => {
    if (!selectedProject) { 
      setExpenses([]); 
      return; 
    }
    const q = query(collection(db, "boq_projects", selectedProject.id, "expenses"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedExpenses: any[] = [];
      querySnapshot.forEach((d) => fetchedExpenses.push({ id: d.id, ...d.data() }));
      
      // Explicitly typed (a: any, b: any) to prevent TS build errors
      fetchedExpenses.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      setExpenses(fetchedExpenses);
    }, (error) => {
      console.error("Live Sync Error:", error.message);
    });
    
    return () => unsubscribe();
  }, [selectedProject]); //[cite: 4]

  const handleProjectSelect = (e: any) => {
    const val = e.target.value;
    if (val === "NEW_PROJECT") { 
      setSelectedProject(null); 
      setExpenses([]); 
      return; 
    }
    setSelectedProject(projects.find(p => p.id === val) || null);
  }; //[cite: 4]

  const handleCreateStandaloneProject = async (e: any) => {
    e.preventDefault();
    if (!newProjectName.trim() || !user) {
      return alert("Please enter a Project Name.");
    }
    
    setIsCreating(true);
    try {
      const payload = { 
        // Changed "userId" to "uid" so the database firewall accepts the write request
        uid: user.uid, //[cite: 4]
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
  }; //[cite: 4]

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
  }; //[cite: 4]

  const handleEdit = (exp: any) => {
    setExpenseForm({ 
      date: exp.date, materialName: exp.materialName, category: exp.category, unit: exp.unit, 
      qty: exp.qty, rate: exp.rate, billableQty: exp.billableQty, billableRate: exp.billableRate 
    });
    setEditingId(exp.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }; //[cite: 4]

  const handleDelete = async (expId: string) => {
    if (!confirm("Are you sure you want to delete this record?")) return;
    await deleteDoc(doc(db, "boq_projects", selectedProject.id, "expenses", expId));
  }; //[cite: 4]

  const inputStyle = "w-full border border-gray-200 bg-gray-50 rounded-xl p-3 md:p-4 text-gray-900 font-medium focus:bg-white focus:ring-2 focus:ring-[#22c55e]/30 focus:border-[#22c55e] transition-all outline-none";
  const selectStyle = `${inputStyle} cursor-pointer appearance-none`;
  const labelStyle = "text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block"; //[cite: 4]

  if (isLoading) return <div className="min-h-screen flex items-center justify-center font-medium text-gray-500 bg-gray-50">Loading Tracker...</div>;

  const isPremium = userData?.tier === 'premium';
  const estimatedBudget = selectedProject?.grandTotal || 0;
  
  // Explicitly typed (sum: number, exp: any) for TS strictness
  const actualTotalSpent = expenses.reduce((sum: number, exp: any) => sum + (Number(exp.actualAmount) || 0), 0);
  const billableTotalSpent = expenses.reduce((sum: number, exp: any) => sum + (Number(exp.billableAmount) || 0), 0);

  const groupedExpenses = CATEGORIES.reduce((acc: any, cat) => {
    const items = expenses.filter(e => e.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {}); //[cite: 4]

  // === CLIENT INVOICE VIEW (PREMIUM) ===
  if (isClientView && selectedProject) {
    return (
      <main className="max-w-5xl mx-auto p-4 md:p-10 my-10 bg-white border border-gray-100 rounded-3xl shadow-xl print:shadow-none print:border-none print:p-0 print:my-0 animate-in fade-in duration-300">
        
        {/* PREMIUM BRANDING HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-200 pb-6 mb-8 print:border-b-2 print:border-gray-300">
          {isPremium ? (
            <div className="flex items-center gap-4 text-left">
              {userData?.avatar && userData.avatar.length > 5 ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={userData.avatar} alt="Business Logo" className="w-16 h-16 object-cover rounded-xl border border-gray-200 shadow-sm" />
              ) : (
                <span className="text-4xl bg-gray-50 p-3 rounded-xl border border-gray-100">{userData?.avatar || "🏢"}</span>
              )}
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight uppercase">{userData?.name}</h1>
                <p className="text-gray-500 font-bold tracking-widest text-xs uppercase mt-1">Official Project Ledger • 📞 {userData?.phone}</p>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Project Billing Summary</h1>
              <p className="text-gray-500 font-bold tracking-widest text-xs uppercase mt-1">OkiConstruct Master Ledger</p>
            </div>
          )}
          <div className="mt-4 md:mt-0 text-left md:text-right">
            <h2 className="text-xl font-bold text-gray-900">{selectedProject.projectName}</h2>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mt-1">Date Generated: {new Date().toLocaleDateString()}</p>
          </div>
        </div>
        
        {Object.keys(groupedExpenses).map(cat => {
          const sectionTotal = groupedExpenses[cat].reduce((sum: number, exp: any) => sum + (Number(exp.billableAmount) || 0), 0);
          return (
            <div key={cat} className="mb-10 print:break-inside-avoid">
              <div className="bg-green-50/50 p-3 rounded-xl border border-green-100 mb-4 inline-block">
                <h3 className="font-bold text-[#15803d] text-sm uppercase tracking-wider">{cat}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="p-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="p-3 font-semibold text-xs text-gray-500 uppercase tracking-wider">Material/Service</th>
                      <th className="p-3 font-semibold text-xs text-gray-500 uppercase tracking-wider text-center">Unit</th>
                      <th className="p-3 font-semibold text-xs text-gray-500 uppercase tracking-wider text-right">Qty</th>
                      <th className="p-3 font-semibold text-xs text-gray-500 uppercase tracking-wider text-right">Rate</th>
                      <th className="p-3 font-semibold text-xs text-gray-500 uppercase tracking-wider text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedExpenses[cat].map((exp: any) => (
                      <tr key={exp.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors print:border-gray-100">
                        <td className="p-3 text-sm text-gray-600">{new Date(exp.date).toLocaleDateString()}</td>
                        <td className="p-3 text-sm font-semibold text-gray-900">{exp.materialName}</td>
                        <td className="p-3 text-sm text-center text-gray-500">{exp.unit}</td>
                        <td className="p-3 text-sm text-right text-gray-900">{exp.billableQty || exp.qty}</td>
                        <td className="p-3 text-sm text-right text-gray-600">₹{(Number(exp.billableRate) || 0).toLocaleString()}</td>
                        <td className="p-3 text-sm font-bold text-gray-900 text-right">₹{(Number(exp.billableAmount) || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50/50 print:bg-transparent">
                      <td colSpan={5} className="p-4 text-right font-semibold text-xs text-gray-500 uppercase tracking-wider">Section Total:</td>
                      <td className="p-4 text-right font-bold text-lg text-gray-900">₹{sectionTotal.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
        
        <div className="mt-12 bg-gray-900 text-white p-8 rounded-2xl flex flex-col md:flex-row justify-between items-center shadow-lg print:break-inside-avoid print:bg-white print:text-black print:border-2 print:border-gray-300 print:shadow-none gap-4">
          <span className="text-sm font-semibold uppercase tracking-widest text-gray-400 print:text-gray-600">Grand Total Due</span>
          <span className="text-4xl md:text-5xl font-black text-[#22c55e] print:text-black">₹{billableTotalSpent.toLocaleString()}</span>
        </div>
        
        <div className="mt-10 flex flex-col md:flex-row gap-4 print:hidden">
          <button onClick={() => setIsClientView(false)} className="flex-1 border border-gray-200 text-gray-600 font-semibold p-4 rounded-xl hover:bg-gray-50 transition-colors">
            ⬅ Back to Ledger
          </button>
          <button onClick={() => window.print()} className="flex-[2] bg-[#22c55e] text-white p-4 font-bold text-lg rounded-xl hover:bg-[#1ea950] transition-colors shadow-md flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
            Download / Print Bill
          </button>
        </div>
      </main>
    );
  }

  // === MASTER TRACKING VIEW ===
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-[1400px] mx-auto p-4 md:p-8 mt-4 w-full flex-grow animate-in fade-in duration-500">
        
        <div className="bg-white border border-gray-100 rounded-3xl p-6 md:p-8 shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-6 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
              <span className="text-3xl">📊</span> Project Ledger
            </h1>
            <p className="text-gray-500 font-medium mt-1 text-sm uppercase tracking-widest">
              OkiConstruct Expense Tracking
            </p>
          </div>
          
          <div className="w-full md:w-80 relative">
            <select 
              className={selectStyle} 
              value={selectedProject ? selectedProject.id : ""} 
              onChange={handleProjectSelect}
            >
              <option value="" disabled>-- Select a Project --</option>
              <option value="NEW_PROJECT" className="font-bold text-[#22c55e]">＋ Create New Blank Project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.projectName}</option>)}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
          </div>
        </div>

        {!selectedProject ? (
          
          <div className="py-10 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Start Tracking</h2>
            <p className="text-gray-500 font-medium mb-10 max-w-xl mx-auto">
              Select an existing project from the dropdown above, or create a brand new ledger to start tracking your expenses instantly.
            </p>
            
            <div className="max-w-md mx-auto bg-white border border-gray-100 rounded-3xl p-8 text-left shadow-lg relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#22c55e] to-[#16a34a]"></div>
              
              <h3 className="font-bold text-xl text-gray-900 mb-6">Create Blank Project</h3>
              
              <form onSubmit={handleCreateStandaloneProject} className="space-y-6">
                <div>
                  <label className={labelStyle}>Project Name</label>
                  <input type="text" required placeholder="e.g. Smith Residence" className={inputStyle} value={newProjectName} onChange={e => setNewProjectName(e.target.value)} />
                </div>
                <div>
                  <label className={labelStyle}>Overall Budget Limit (Optional)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                    <input type="number" inputMode="decimal" min="0" placeholder="0" className={`${inputStyle} pl-8`} value={newProjectBudget} onChange={e => setNewProjectBudget(e.target.value)} />
                  </div>
                </div>
                <button type="submit" disabled={isCreating} className={`w-full text-white font-semibold text-lg p-4 rounded-xl shadow-md flex justify-center items-center gap-2 transition-all ${isCreating ? 'bg-gray-400 opacity-70 cursor-not-allowed' : 'bg-gray-900 hover:bg-[#22c55e]'}`}>
                  {isCreating ? "Creating Tracker..." : <>Create & Open Ledger <span className="text-xl">➔</span></>}
                </button>
              </form>
            </div>
          </div>

        ) : (

          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="bg-white border border-gray-100 rounded-3xl p-6 md:p-8 shadow-sm print:hidden">
              <h2 className="font-bold text-xl text-gray-900 mb-6 flex items-center gap-2">
                <span className="bg-green-50 text-[#22c55e] w-8 h-8 rounded-lg flex items-center justify-center text-sm">
                  {editingId ? "✏️" : "➕"}
                </span>
                {editingId ? "Update Entry" : "Add Expenditure"}
              </h2>
              
              <form onSubmit={handleSubmitExpense} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 lg:gap-6 items-end">
                <div className="lg:col-span-2">
                  <label className={labelStyle}>Date</label>
                  <input type="date" required className={inputStyle} value={expenseForm.date} onChange={e => setExpenseForm({...expenseForm, date: e.target.value})} />
                </div>
                <div className="lg:col-span-3">
                  <label className={labelStyle}>Material / Service</label>
                  <input type="text" required placeholder="e.g. Portland Cement" className={inputStyle} value={expenseForm.materialName} onChange={e => setExpenseForm({...expenseForm, materialName: e.target.value})} />
                </div>
                <div className="lg:col-span-3">
                  <label className={labelStyle}>Category</label>
                  <div className="relative">
                    <select className={selectStyle} value={expenseForm.category} onChange={e => setExpenseForm({...expenseForm, category: e.target.value})}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
                  </div>
                </div>
                <div className="lg:col-span-2">
                  <label className={labelStyle}>Unit</label>
                  <div className="relative">
                    <select className={selectStyle} value={expenseForm.unit} onChange={e => setExpenseForm({...expenseForm, unit: e.target.value})}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-sm">▼</div>
                  </div>
                </div>

                <div className="col-span-full border-t border-gray-100 my-2 lg:hidden"></div>

                <div className="lg:col-span-2">
                  <label className={`text-xs font-bold uppercase tracking-wider mb-2 block ${isPremium ? 'text-red-500' : 'text-gray-500'}`}>{isPremium ? 'Act Qty' : 'Qty'}</label>
                  <input type="number" required inputMode="decimal" min="0" step="any" placeholder="0" className={`${inputStyle} ${isPremium ? 'border-red-100 bg-red-50 focus:ring-red-200 focus:border-red-300' : ''}`} value={expenseForm.qty} onChange={e => setExpenseForm({...expenseForm, qty: e.target.value})} />
                </div>
                <div className="lg:col-span-2">
                  <label className={`text-xs font-bold uppercase tracking-wider mb-2 block ${isPremium ? 'text-red-500' : 'text-gray-500'}`}>{isPremium ? 'Act Rate' : 'Rate'}</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">₹</span>
                    <input type="number" required inputMode="decimal" min="0" step="any" placeholder="0" className={`${inputStyle} pl-8 ${isPremium ? 'border-red-100 bg-red-50 focus:ring-red-200 focus:border-red-300' : ''}`} value={expenseForm.rate} onChange={e => setExpenseForm({...expenseForm, rate: e.target.value})} />
                  </div>
                </div>

                {isPremium && (
                  <>
                    <div className="lg:col-span-2">
                      <label className="text-xs font-bold text-[#22c55e] uppercase tracking-wider mb-2 block">Bill Qty</label>
                      <input type="number" inputMode="decimal" min="0" step="any" placeholder="Auto" className={`${inputStyle} border-green-200 bg-green-50 focus:ring-green-200 focus:border-[#22c55e]`} value={expenseForm.billableQty} onChange={e => setExpenseForm({...expenseForm, billableQty: e.target.value})} />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="text-xs font-bold text-[#22c55e] uppercase tracking-wider mb-2 block">Bill Rate</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#22c55e] font-medium">₹</span>
                        <input type="number" inputMode="decimal" min="0" step="any" placeholder="Auto" className={`${inputStyle} pl-8 border-green-200 bg-green-50 focus:ring-green-200 focus:border-[#22c55e]`} value={expenseForm.billableRate} onChange={e => setExpenseForm({...expenseForm, billableRate: e.target.value})} />
                      </div>
                    </div>
                  </>
                )}

                <div className={`lg:col-span-${isPremium ? '4' : '8'} flex flex-col justify-end`}>
                  <button type="submit" className={`w-full text-white p-4 rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2 ${editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-900 hover:bg-[#22c55e]'}`}>
                    {editingId ? 'Save Update' : <>Add Expense <span>+</span></>}
                  </button>
                  {editingId && (
                    <button type="button" onClick={() => {setEditingId(null); setExpenseForm(INITIAL_FORM)}} className="w-full mt-3 text-sm font-semibold text-gray-500 hover:text-gray-900 transition-colors">Cancel Edit</button>
                  )}
                </div>
              </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col justify-center">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm">🎯</div>
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Project Budget limit</span>
                </div>
                <span className="text-3xl font-black text-gray-900">₹{estimatedBudget.toLocaleString()}</span>
              </div>
              
              <div className="bg-red-50 border border-red-100 rounded-3xl p-6 shadow-sm flex flex-col justify-center">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm">📉</div>
                  <span className="text-xs font-bold uppercase tracking-widest text-red-600">Actual Expenditure</span>
                </div>
                <span className="text-4xl font-black text-red-600">₹{actualTotalSpent.toLocaleString()}</span>
              </div>

              {isPremium ? (
                <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-lg flex flex-col justify-center relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-[#22c55e]/10 rounded-full -mr-10 -mt-10 blur-xl"></div>
                  <div className="flex items-center gap-3 mb-2 relative z-10">
                    <div className="w-8 h-8 rounded-full bg-[#22c55e]/20 text-[#22c55e] flex items-center justify-center text-sm">📈</div>
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Client Billable Total</span>
                  </div>
                  <span className="text-4xl font-black text-[#22c55e] relative z-10">₹{billableTotalSpent.toLocaleString()}</span>
                  <span className="text-xs font-bold mt-3 bg-white/10 text-white px-3 py-1.5 rounded-lg inline-block w-fit backdrop-blur-md relative z-10">
                    PROFIT MARGIN: ₹{(billableTotalSpent - actualTotalSpent).toLocaleString()}
                  </span>
                </div>
              ) : (
                <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm flex flex-col justify-center">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center text-sm">⚖️</div>
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Budget Remaining</span>
                  </div>
                  <span className={`text-3xl font-black ${estimatedBudget - actualTotalSpent < 0 ? 'text-red-600' : 'text-[#22c55e]'}`}>
                    ₹{(estimatedBudget - actualTotalSpent).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col md:flex-row gap-4 print:hidden">
              <button onClick={() => window.print()} className="bg-white text-gray-700 border border-gray-200 rounded-xl px-6 py-4 font-bold hover:bg-gray-50 transition-colors shadow-sm flex items-center justify-center gap-2 flex-1 md:flex-none">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                Print Internal Ledger
              </button>
              {isPremium && (
                <button onClick={() => setIsClientView(true)} className="bg-[#22c55e] text-white rounded-xl px-6 py-4 font-bold hover:bg-[#1ea950] transition-colors shadow-md flex items-center justify-center gap-2 flex-1 md:flex-none">
                  Preview Client Bill ➔
                </button>
              )}
            </div>

            <div className="border border-gray-200 rounded-3xl bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider">Material</th>
                      <th className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-center">Unit</th>
                      <th className="p-4 font-semibold text-xs uppercase tracking-wider text-right text-red-500">{isPremium ? 'Act Qty' : 'Qty'}</th>
                      <th className="p-4 font-semibold text-xs uppercase tracking-wider text-right text-red-500">{isPremium ? 'Act Rate' : 'Rate'}</th>
                      <th className="p-4 font-semibold text-xs uppercase tracking-wider text-right text-red-500 border-r border-gray-100">{isPremium ? 'Act Amount' : 'Amount'}</th>
                      
                      {isPremium && (
                        <>
                          <th className="p-4 font-semibold text-xs uppercase tracking-wider text-right text-[#15803d]">Bill Qty</th>
                          <th className="p-4 font-semibold text-xs uppercase tracking-wider text-right text-[#15803d]">Bill Rate</th>
                          <th className="p-4 font-semibold text-xs uppercase tracking-wider text-right text-[#15803d]">Bill Amount</th>
                        </>
                      )}
                      <th className="p-4 font-semibold text-xs text-gray-500 uppercase tracking-wider text-center print:hidden">Actions</th>
                    </tr>
                  </thead>
                  
                  {Object.keys(groupedExpenses).length === 0 ? (
                    <tbody>
                      <tr>
                        <td colSpan={10} className="p-20 text-center font-medium text-gray-400">
                          <div className="text-4xl mb-3">📝</div>
                          No expenses logged yet. Fill out the form above to start tracking!
                        </td>
                      </tr>
                    </tbody>
                  ) : (
                    Object.keys(groupedExpenses).map(cat => {
                      const secActual = groupedExpenses[cat].reduce((sum: number, exp: any) => sum + (Number(exp.actualAmount) || 0), 0);
                      const secBillable = groupedExpenses[cat].reduce((sum: number, exp: any) => sum + (Number(exp.billableAmount) || 0), 0);
                      
                      return (
                        <tbody key={cat}>
                          <tr className="bg-gray-50/80">
                            <td colSpan={10} className="px-4 py-3">
                              <span className="font-bold text-xs uppercase tracking-wider text-gray-700 bg-white px-3 py-1 rounded-lg border border-gray-200 shadow-sm inline-block">
                                {cat}
                              </span>
                            </td>
                          </tr>
                          
                          {groupedExpenses[cat].map((exp: any) => (
                            <tr key={exp.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                              <td className="p-4 text-sm font-medium text-gray-500 whitespace-nowrap">{new Date(exp.date).toLocaleDateString()}</td>
                              <td className="p-4 text-sm font-semibold text-gray-900">{exp.materialName}</td>
                              <td className="p-4 text-sm font-medium text-gray-500 text-center">{exp.unit}</td>
                              <td className="p-4 text-sm font-medium text-right text-red-500">{exp.qty}</td>
                              <td className="p-4 text-sm font-medium text-right text-red-500">₹{(Number(exp.rate) || 0).toLocaleString()}</td>
                              <td className="p-4 text-sm font-bold text-right text-red-600 border-r border-gray-100 bg-red-50/30">₹{(Number(exp.actualAmount) || 0).toLocaleString()}</td>
                              
                              {isPremium && (
                                <>
                                  <td className="p-4 text-sm font-medium text-right text-gray-600">{exp.billableQty || exp.qty}</td>
                                  <td className="p-4 text-sm font-medium text-right text-gray-600">₹{(Number(exp.billableRate) || 0).toLocaleString()}</td>
                                  <td className="p-4 text-sm font-bold text-right text-[#15803d] bg-green-50/30">₹{(Number(exp.billableAmount) || 0).toLocaleString()}</td>
                                </>
                              )}
                              
                              <td className="p-4 text-center print:hidden">
                                <div className="flex items-center justify-center gap-2">
                                  <button onClick={() => handleEdit(exp)} className="text-gray-400 hover:text-blue-600 transition-colors p-1" title="Edit">
                                    ✏️
                                  </button>
                                  <button onClick={() => handleDelete(exp.id)} className="text-gray-400 hover:text-red-600 transition-colors p-1" title="Delete">
                                    🗑️
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          
                          <tr className="border-b border-gray-200 bg-gray-50/30">
                            <td colSpan={5} className="p-3 text-right font-semibold text-xs text-gray-500 uppercase tracking-wider">Subtotal:</td>
                            <td className="p-3 text-right font-bold text-red-600 bg-red-50/50">₹{secActual.toLocaleString()}</td>
                            {isPremium && (
                              <>
                                <td colSpan={2}></td>
                                <td className="p-3 text-right font-bold text-[#15803d] bg-green-50/50">₹{secBillable.toLocaleString()}</td>
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
                      <tr className="bg-gray-900 text-white">
                        <td colSpan={5} className="p-5 text-right font-bold text-sm uppercase tracking-wider text-gray-300">Grand Total:</td>
                        <td className="p-5 text-right font-black text-xl text-red-400">₹{actualTotalSpent.toLocaleString()}</td>
                        {isPremium && (
                          <>
                            <td colSpan={2}></td>
                            <td className="p-5 text-right font-black text-xl text-[#22c55e]">₹{billableTotalSpent.toLocaleString()}</td>
                          </>
                        )}
                        <td className="print:hidden"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}