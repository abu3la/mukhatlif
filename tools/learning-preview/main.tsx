import { createRoot } from 'react-dom/client';
import { CourseCatalog } from '../../apps/web/src/components/courses/catalog';
import { CoursePage } from '../../apps/web/src/components/courses/course';
import { PreviewProvider } from './customer';
import '../../apps/web/src/app/listener.css';
import '../../apps/web/src/app/handoff.css';
const path = location.pathname;
const id = path.match(/^\/courses\/([^/]+)$/)?.[1];
createRoot(document.getElementById('root')!).render(
  <PreviewProvider>
    {id ? <CoursePage courseId={id} /> : <CourseCatalog mine={path === '/library/courses'} />}
  </PreviewProvider>,
);
