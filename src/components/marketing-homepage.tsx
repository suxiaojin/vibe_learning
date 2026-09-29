import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HomepageImageSlot, HomepageText } from "@/lib/homepage-settings";
import styles from "./marketing-homepage.module.css";

type MarketingHomepageProps = {
  signedIn: boolean;
  content: HomepageText;
  images: Record<HomepageImageSlot, string>;
};

function Brand({ text, footer = false }: { text: string; footer?: boolean }) {
  const breakAt = text.indexOf(" ");
  return (
    <a className={`${styles.brand} ${footer ? styles.footerBrand : ""}`} href="#top" aria-label={`${text} 首页顶部`}>
      {breakAt < 0 ? <span>{text}</span> : <><span>{text.slice(0, breakAt)}</span>{text.slice(breakAt)}</>}
    </a>
  );
}

export function MarketingHomepage({ signedIn, content, images }: MarketingHomepageProps) {
  const startHref = signedIn ? "/learn" : "/register";
  const startText = signedIn ? content.actionContinue : content.actionStart;
  const features = [
    {
      id: "learning-path",
      label: content.pathLabel,
      title: content.pathTitleLead,
      emphasis: content.pathTitleAccent,
      lines: [content.pathDescriptionLead, content.pathDescriptionMore],
      image: "learning-path",
      alt: content.pathAlt,
      width: 1000,
      height: 850
    },
    {
      id: "ai-explanation",
      label: content.aiLabel,
      title: content.aiTitleLead,
      emphasis: content.aiTitleAccent,
      lines: [content.aiDescriptionLead, content.aiDescriptionMore],
      image: "ai-explanation",
      alt: content.aiAlt,
      width: 1000,
      height: 850
    },
    {
      id: "study-buddy",
      label: content.buddyLabel,
      title: content.buddyTitleLead,
      emphasis: content.buddyTitleAccent,
      lines: [content.buddyDescriptionLead, content.buddyDescriptionMore],
      image: "study-buddy",
      alt: content.buddyAlt,
      width: 1000,
      height: 900
    },
    {
      id: "review",
      label: content.reviewLabel,
      title: content.reviewTitleLead,
      emphasis: content.reviewTitleAccent,
      lines: [content.reviewDescriptionLead, content.reviewDescriptionMore],
      image: "review",
      alt: content.reviewAlt,
      width: 1000,
      height: 850
    }
  ] as const;

  return (
    <div className={styles.page} id="top">
      <a className={styles.skipLink} href="#main-content">{content.skipLink}</a>

      <header className={styles.header}>
        <div className={`${styles.container} ${styles.headerInner}`}>
          <Brand text={content.brand} />
          <nav className={styles.navigation} aria-label="首页导航">
            <a className={styles.learningNav} href="#learning-path">{content.navLearning}</a>
            <a className={styles.buddyNav} href="#study-buddy">{content.navBuddy}</a>
            <Link className={styles.headerAction} href={signedIn ? "/learn" : "/login"} prefetch={false}>
              {signedIn ? content.navContinue : content.navLogin}
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className={`${styles.container} ${styles.hero}`} aria-labelledby="hero-title">
          <div className={styles.heroArtwork}>
            <Image
              alt={content.heroAlt}
              className={styles.artwork}
              src={images.hero}
              width={1000}
              height={900}
              sizes="(max-width: 767px) 88vw, (max-width: 1199px) 48vw, 580px"
              priority
            />
          </div>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle} id="hero-title">
              <span>{content.heroTitleLead}</span>
              <span className={styles.emphasis}>{content.heroTitleAccent}</span>
            </h1>
            <p className={styles.heroDescription}>
              {content.heroDescriptionLead}
              <span>{content.heroDescriptionMore}</span>
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href={startHref} prefetch={false}>{startText}</Link>
              {signedIn ? (
                <Link className={styles.secondaryButton} href="/course-center" prefetch={false}>{content.actionCourse}</Link>
              ) : (
                <Link className={styles.secondaryButton} href="/login" prefetch={false}>{content.actionExisting}</Link>
              )}
            </div>
          </div>
        </section>

        <div className={styles.container}>
          {features.map((feature, index) => (
            <section
              className={`${styles.feature} ${index % 2 === 1 ? styles.featureReversed : ""}`}
              id={feature.id}
              key={feature.id}
              aria-labelledby={`${feature.id}-title`}
            >
              <div className={styles.featureContent}>
                <p className={styles.eyebrow}>{feature.label}</p>
                <h2 className={styles.featureTitle} id={`${feature.id}-title`}>
                  <span>{feature.title}</span>
                  <span className={styles.emphasis}>{feature.emphasis}</span>
                </h2>
                <p className={styles.description}>
                  {feature.lines.map((line) => <span key={line}>{line}</span>)}
                </p>
                {feature.id === "study-buddy" ? (
                  <Link className={styles.textLink} href={signedIn ? "/study-buddy" : "/login"} prefetch={false}>
                    {signedIn ? content.buddyActionMember : content.buddyActionGuest}
                    <ArrowRight size={20} aria-hidden="true" />
                  </Link>
                ) : null}
              </div>
              <div className={styles.featureArtwork}>
                <Image
                  alt={feature.alt}
                  className={styles.artwork}
                  src={images[feature.image]}
                  width={feature.width}
                  height={feature.height}
                  sizes="(max-width: 767px) 88vw, (max-width: 1199px) 44vw, 510px"
                />
              </div>
            </section>
          ))}
        </div>

        <section className={styles.closing} aria-labelledby="closing-title">
          <div className={`${styles.container} ${styles.closingInner}`}>
            <div className={styles.closingContent}>
              <h2 className={styles.closingTitle} id="closing-title">{content.closingTitleLead}<span className={styles.emphasis}>{content.closingTitleAccent}</span></h2>
              <p className={styles.description}>{content.closingDescription}</p>
              <Link className={styles.primaryButton} href={startHref} prefetch={false}>{startText}</Link>
            </div>
            <Image
              alt={content.startAlt}
              className={styles.closingArtwork}
              src={images.start}
              width={800}
              height={650}
              sizes="(max-width: 767px) 180px, 280px"
            />
          </div>
        </section>
      </main>

      <footer className={`${styles.container} ${styles.footer}`}>
        <Brand text={content.brand} footer />
        <nav aria-label="网站信息" className={styles.footerLinks}>
          <Link href="/help" prefetch={false}>{signedIn ? content.footerHelp : content.footerHelpGuest}</Link>
          <Link href="/user-agreement" prefetch={false}>{content.footerAgreement}</Link>
          <Link href="/privacy-policy" prefetch={false}>{content.footerPrivacy}</Link>
        </nav>
      </footer>
    </div>
  );
}
