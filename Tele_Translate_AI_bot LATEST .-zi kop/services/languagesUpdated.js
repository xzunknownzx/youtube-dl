const languageOptions = [
    { text: 'English', callback_data: 'lang_en' },
    { text: 'Ukrainian', callback_data: 'lang_uk' },
    { text: 'Dutch', callback_data: 'lang_nl' },
    { text: 'French', callback_data: 'lang_fr' },
    { text: 'German', callback_data: 'lang_de' },
    { text: 'Spanish', callback_data: 'lang_es' },
    { text: 'Portuguese', callback_data: 'lang_pt' },
    { text: 'Italian', callback_data: 'lang_it' },
    { text: 'Russian', callback_data: 'lang_ru' },
    { text: 'Chinese', callback_data: 'lang_zh' },
    { text: 'Japanese', callback_data: 'lang_ja' },
    { text: 'Arabic', callback_data: 'lang_ar' },
    { text: 'Farsi', callback_data: 'lang_fa' },
    { text: 'Bengali', callback_data: 'lang_bn' },
    { text: 'Hindi', callback_data: 'lang_hi' },
    { text: 'Urdu', callback_data: 'lang_ur' },
    { text: 'Punjabi', callback_data: 'lang_pa' },
    { text: 'Vietnamese', callback_data: 'lang_vi' },
    { text: 'Yoruba', callback_data: 'lang_yo' },
    { text: 'Amazigh', callback_data: 'lang_amz' },
    { text: 'Romanian', callback_data: 'lang_ro' },
    { text: 'Bamileke', callback_data: 'lang_bam' },
    { text: 'Croatian', callback_data: 'lang_hr' }
];

const regions = {
    'lang_en': ['US', 'UK', 'India', 'Canada', 'Ireland', 'Jamaica', 'Australia', 'Singapore', 'New Zealand', 'South Africa'],
    'lang_uk': ['Kyiv', 'Lviv', 'Odesa', 'Dnipro', 'Kharkiv', 'Donetsk', 'Ternopil', 'Vinnytsia', 'Chernivtsi', 'Zakarpattia', 'Zaporizhzhia', 'Ivano-Frankivsk'],
    'lang_nl': ['Belgium', 'Aruba', 'Curaçao', 'Suriname', 'Netherlands', 'Sint Maarten'],
    'lang_fr': ['France', 'Canada', 'Belgium', 'Monaco', 'Algeria', 'Morocco', 'Tunisia', 'Senegal', 'Haiti', 'Switzerland', 'Luxembourg', 'Côte d\'Ivoire'],
    'lang_de': ['Germany', 'Austria', 'Belgium', 'Switzerland', 'Luxembourg', 'Liechtenstein'],
    'lang_es': ['Spain', 'Mexico', 'Peru', 'Chile', 'Cuba', 'Panama', 'Uruguay', 'Colombia', 'Venezuela', 'Argentina', 'Ecuador', 'Guatemala', 'Honduras', 'Paraguay', 'Nicaragua', 'Costa Rica', 'Puerto Rico', 'El Salvador', 'Dominican Republic', 'Equatorial Guinea'],
    'lang_pt': ['Brazil', 'Angola', 'Macau', 'Portugal', 'Mozambique', 'Cape Verde', 'East Timor', 'Guinea-Bissau', 'Equatorial Guinea', 'São Tomé and Príncipe'],
    'lang_it': ['Italy', 'Croatia', 'Slovenia', 'Switzerland', 'San Marino', 'Vatican City'],
    'lang_ru': ['Russia', 'Belarus', 'Ukraine', 'Latvia', 'Estonia', 'Moldova', 'Lithuania', 'Kazakhstan', 'Kyrgyzstan', 'Tajikistan'],
    'lang_zh': ['China', 'Taiwan', 'Malaysia', 'Singapore', 'Indonesia'],
    'lang_ja': ['Japan', 'Brazil', 'Philippines', 'United States'],
    'lang_ar': ['Egypt', 'Iraq', 'Syria', 'Sudan', 'Libya', 'Jordan', 'Yemen', 'Oman', 'UAE', 'Qatar', 'Kuwait', 'Saudi Arabia', 'Algeria', 'Morocco', 'Tunisia', 'Lebanon', 'Bahrain', 'Somalia', 'Djibouti', 'Comoros', 'Mauritania'],
    'lang_fa': ['Iran', 'Afghanistan', 'Tajikistan', 'Uzbekistan'],
    'lang_bn': ['Bangladesh', 'India', 'UAE', 'UK', 'USA', 'Saudi Arabia'],
    'lang_hi': ['India', 'Nepal', 'Fiji', 'UAE', 'USA', 'UK'],
    'lang_ur': ['Pakistan', 'India', 'UAE', 'UK', 'USA', 'Canada'],
    'lang_pa': ['India', 'Pakistan', 'UK', 'USA', 'Canada', 'Australia'],
    'lang_vi': ['Vietnam', 'USA', 'France', 'Canada', 'Germany', 'Australia'],
    'lang_yo': ['Nigeria', 'Benin', 'Togo', 'UK', 'USA'],
    'lang_amz': ['Morocco', 'Algeria', 'Libya', 'Mali', 'Niger', 'Tunisia', 'Burkina Faso', 'Mauritania'],
    'lang_ro': ['Romania', 'Moldova', 'Ukraine', 'Serbia', 'Hungary', 'Bulgaria'],
    'lang_bam': ['Cameroon', 'Nigeria'],
    'lang_hr': ['Croatia', 'Austria', 'Hungary', 'Italy', 'Serbia', 'Montenegro', 'Bosnia and Herzegovina']
};

// ... (keep the rest of the code from languages.js, including dialectMapping, dialects, and other functions)

function sortRegionsByLength(regions) {
    return regions.sort((a, b) => a.length - b.length);
}

module.exports = {
    languageOptions,
    regions,
    dialectMapping,
    dialects,
    sortRegionsByLength
};