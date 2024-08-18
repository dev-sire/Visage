import { Helmet } from 'react-helmet';

const OGImage = () => {
    const ogImage = '/assets/images/ogImage.png';

    return (
        <Helmet>
            <meta property="og:image" content={ogImage} />
        </Helmet>
    );
};

export default OGImage;