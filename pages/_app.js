import localFont from 'next/font/local';
import '../styles/globals.css';

const creatoDisplay = localFont({
  src: [
    { path: '../styles/fonts/creato-display/CreatoDisplay-Regular.otf', weight: '400', style: 'normal' },
    { path: '../styles/fonts/creato-display/CreatoDisplay-Medium.otf', weight: '500', style: 'normal' },
    { path: '../styles/fonts/creato-display/CreatoDisplay-Bold.otf', weight: '700', style: 'normal' },
    { path: '../styles/fonts/creato-display/CreatoDisplay-ExtraBold.otf', weight: '800', style: 'normal' },
  ],
  display: 'swap',
  fallback: ['Arial', 'sans-serif'],
});

export default function App({ Component, pageProps }) {
  return (
    <>
      <style jsx global>{`
        :root { --font-creato: ${creatoDisplay.style.fontFamily}; }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
