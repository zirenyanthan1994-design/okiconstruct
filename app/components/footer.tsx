"use client";
import Link from 'next/link';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-gray-100 mt-auto print:hidden">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-12 md:py-16">
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          
          {/* Brand Section */}
          <div className="lg:col-span-1">
            <Link href="/" className="font-extrabold text-2xl tracking-tight cursor-pointer inline-block mb-4">
              <span className="text-gray-900">OKI</span><span className="text-[#22c55e]">CONSTRUCT</span>
            </Link>
            <p className="text-gray-500 font-medium text-sm leading-relaxed mb-6">
              The modern cloud platform for accurate construction estimation, intelligent BOQ generation, and real-time expense tracking.
            </p>
          </div>

          {/* Tools & Features */}
          <div>
            <h3 className="font-bold text-gray-900 mb-4 uppercase tracking-wider text-xs">Platform</h3>
            <ul className="space-y-3">
              <li><Link href="/estimate-boq" className="text-gray-500 hover:text-[#22c55e] font-medium text-sm transition-colors">Estimate BOQ</Link></li>
              <li><Link href="/track-expenditure" className="text-gray-500 hover:text-[#22c55e] font-medium text-sm transition-colors">Expense Tracking</Link></li>
              <li><Link href="/contact-experts" className="text-[#22c55e] font-bold text-sm transition-colors hover:text-[#1ea950]">Pro Consulting ➔</Link></li>
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="font-bold text-gray-900 mb-4 uppercase tracking-wider text-xs">Company</h3>
            <ul className="space-y-3">
              <li><Link href="/about" className="text-gray-500 hover:text-[#22c55e] font-medium text-sm transition-colors">About Us</Link></li>
              <li><Link href="/faq" className="text-gray-500 hover:text-[#22c55e] font-medium text-sm transition-colors">Help & FAQ</Link></li>
              {/* THE NEW CONTACT US LINK IS HERE */}
              <li><Link href="/contact" className="text-gray-500 hover:text-[#22c55e] font-medium text-sm transition-colors">Contact Us</Link></li>
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="font-bold text-gray-900 mb-4 uppercase tracking-wider text-xs">Legal</h3>
            <ul className="space-y-3">
              <li><Link href="/terms" className="text-gray-500 hover:text-[#22c55e] font-medium text-sm transition-colors">Terms & Conditions</Link></li>
              <li><Link href="/privacy" className="text-gray-500 hover:text-[#22c55e] font-medium text-sm transition-colors">Privacy Policy</Link></li>
            </ul>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-100 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-400 text-sm font-medium">
            © {currentYear} OkiConstruct. All rights reserved.
          </p>
          <div className="flex gap-4">
            <span className="text-gray-400 text-sm font-bold bg-gray-50 px-3 py-1 rounded-lg border border-gray-100">
              Made for Builders
            </span>
          </div>
        </div>

      </div>
    </footer>
  );
}