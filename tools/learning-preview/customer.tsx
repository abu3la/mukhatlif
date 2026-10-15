/** Local QA only. This module is never imported by either production application. */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
const Context = createContext<ReturnType<typeof value> | null>(null);
function value(id: string, select: (id: string) => void) {
  return {
    config: { apiOrigin: 'http://127.0.0.1:3102/api' },
    user: id ? { id } : null,
    client: {
      auth: {
        getSession: async () => ({
          data: { session: id ? { user: { id }, access_token: id } : null },
        }),
      },
    },
    requireAccount: () => {
      if (!id) {
        select('usr-listener-1');
        return false;
      }
      return true;
    },
    loading: false,
  };
}
export function PreviewProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState(localStorage.getItem('learning-preview-user') ?? '');
  const [dark, setDark] = useState(false);
  const select = (id: string) => {
    localStorage.setItem('learning-preview-user', id);
    setId(id);
  };
  const context = useMemo(() => value(id, select), [id]);
  return (
    <Context.Provider value={context}>
      <aside
        style={{
          padding: '16px',
          background: '#171a56',
          color: 'white',
          display: 'flex',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <strong>مختبر محلي: حسابات وهمية، بيانات Frappe فعلية، بلا دفع.</strong>
        <label>
          حساب الاختبار
          <select value={id} onChange={(e) => select(e.target.value)}>
            <option value="">زائر</option>
            <option value="usr-listener-1">متعلم 1</option>
            <option value="usr-listener-2">متعلم 2</option>
          </select>
        </label>
        <button
          onClick={() => {
            setDark(!dark);
            document.documentElement.dataset.concept = dark ? 'first' : 'third';
          }}
        >
          تبديل المظهر
        </button>
        <a href="/courses">الدورات</a>
        <a href="/library/courses">دوراتي</a>
      </aside>
      {children}
    </Context.Provider>
  );
}
export function useCustomer() {
  const context = useContext(Context);
  if (!context) throw new Error('Preview provider missing');
  return context;
}
export function CustomerGate({ children }: { children: ReactNode }) {
  const { user } = useCustomer();
  return user ? children : <p>اختر حساب اختبار من أعلى الصفحة.</p>;
}
