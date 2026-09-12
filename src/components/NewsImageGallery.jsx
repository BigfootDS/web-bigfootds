import { useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Fullscreen from 'yet-another-react-lightbox/plugins/fullscreen';
import Thumbnails from 'yet-another-react-lightbox/plugins/thumbnails';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/thumbnails.css';

import '../styles/news-image-gallery.css';

/**
 * Renders a semantic News gallery with ordinary image links as the no-script
 * fallback, then progressively enhances it with a keyboard-accessible
 * fullscreen lightbox when the island hydrates.
 *
 * @param {{ images: readonly { alt: string, caption?: string, src: string }[], layout: 'carousel' | 'grid' }} props - Safe snapshot image references.
 * @returns {import('react').ReactNode} A static-first image gallery.
 */
export default function NewsImageGallery({ images, layout }) {
	const [index, setIndex] = useState(-1);
	const slides = images.map((image) => ({ alt: image.alt, src: image.src }));

	return (
		<section className={'news-image-gallery news-image-gallery--' + layout} aria-label="Article image gallery">
			<div className="news-image-gallery__items">
				{images.map((image, imageIndex) => (
					<figure className="news-image-gallery__item" key={image.src}>
						<a
							href={image.src}
							onClick={(event) => {
								event.preventDefault();
								setIndex(imageIndex);
							}}
						>
							<img alt={image.alt} loading="lazy" src={image.src} />
						</a>
						{image.caption === undefined ? null : <figcaption>{image.caption}</figcaption>}
					</figure>
				))}
			</div>
			<Lightbox
				close={() => setIndex(-1)}
				fullscreen={{ auto: false }}
				index={Math.max(index, 0)}
				open={index >= 0}
				plugins={[Fullscreen, Thumbnails, Zoom]}
				slides={slides}
			/>
		</section>
	);
}
