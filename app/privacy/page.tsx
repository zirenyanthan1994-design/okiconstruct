"use client";
import React from 'react';
import Navbar from '../components/Navbar';
import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Navbar />

      <main className="max-w-4xl mx-auto p-4 md:p-8 mt-8 w-full flex-grow animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        <div className="bg-white border border-gray-100 rounded-3xl p-8 md:p-12 shadow-sm relative overflow-hidden">
          
          {/* Decorative Top Border */}
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#22c55e] to-[#16a34a]"></div>

          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-green-50 text-[#22c55e] rounded-2xl flex items-center justify-center mx-auto mb-6 text-4xl shadow-sm">
              🔒
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-4">
              Privacy Policy
            </h1>
            <p className="text-lg font-medium text-gray-500">
              Effective Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          <div className="space-y-8 text-gray-600 font-medium leading-relaxed">
            
            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">1. Information We Collect</h2>
              <p className="mb-3">To provide you with OkiConstruct's services, we collect:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong className="text-gray-900">Account Information:</strong> Name, email address, phone number, professional role (e.g., Contractor, Architect), and custom business avatars/logos.</li>
                <li><strong className="text-gray-900">Project Data:</strong> Floor layouts, custom material rates, daily expense logs, and budget limits that you actively input into our BOQ and Ledger engines.</li>
                <li><strong className="text-gray-900">Authentication Data:</strong> Handled securely via Google Firebase Authentication.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">2. How We Use Your Information</h2>
              <p className="mb-3">We use your data strictly to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Generate your requested architectural calculations and BOQ reports.</li>
                <li>Save your project workspaces to the cloud so you can access them across devices.</li>
                <li>Apply your custom branding (name and logo) to exported PDF documents.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">3. Data Storage and Security</h2>
              <p>
                Your data is securely hosted on Google Firebase. We do not sell, rent, or trade your personal or project data to third-party advertising companies. Your financial ledgers and project budgets remain strictly confidential to your authenticated account.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 border-b border-gray-100 pb-2">4. Your Rights</h2>
              <p>
                You have the right to access, edit, or delete your project data at any time from your Profile Workspace. If you wish to completely delete your OkiConstruct account and all associated data, please contact our support team.
              </p>
            </section>

          </div>

          {/* Back Navigation */}
          <div className="mt-12 text-center pt-8 border-t border-gray-100">
            <Link href="/" className="inline-flex items-center gap-2 font-bold text-gray-500 hover:text-gray-900 transition-colors bg-gray-50 px-6 py-3 rounded-xl border border-gray-200 hover:border-gray-300">
              ⬅ Back to Home
            </Link>
          </div>

        </div>
      </main>
    </div>
  );
}