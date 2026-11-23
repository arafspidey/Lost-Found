// All places people can choose: District -> Upazila -> Village/Mohalla.
//
// To add more places, just add lines here and restart the server (node server.js).
// Nothing gets deleted: existing items keep their location.
// Districts and upazilas with an empty list [] are stored but hidden from the dropdowns
// until they have at least one village/mohalla.
//
// Rajshahi city names come from the Rajshahi City Corporation ward list.
// Check them against the real places and add anything missing.
module.exports = {
  Rajshahi: {
    'Rajshahi City Corporation': [
      'Aduburi', 'Ahmednagar', 'Assam Colony', 'Bad Kazla', 'Baharampur', 'Bakhtiarabad',
      'Baliapukur', 'Ballavganj', 'Betiapara', 'Bhatapara', 'Boalia Para', 'Budhapara',
      'Bulanpur', 'Chakpar Meherchandi', 'Chandipur', 'Dargapara', 'Dashmari', 'Dharampur',
      'Fadkipara', 'Firozabad', 'Ganakpara', 'Gaurhanga', 'Ghoramara', 'Ghuripara',
      'Goalpara', 'Gorosthanpara', 'Hargram Bazar', 'Hargram Bidirpara', 'Hargram Colony',
      'Hargram Munshipara', 'Hargram Newpara', 'Hargram Ranidighi', 'Helenabad Colony',
      'Hetem Khan', 'Hetem Khan Shajipara', 'Hordupur', 'Hosnaganj', 'Juranagar', 'Kadirganj',
      'Karikarpara', 'Kashiadanga', 'Kazihata', 'Kazla', 'Keshabpur', 'Khojapur', 'Kulupara',
      'Kumarpara', 'Laxmipur', 'Mahisbathan', 'Malopara', 'Matherdanga', 'Matherpara',
      'Medical College Campus', 'Meherchandi', 'Miyapara', 'Mirerchak', 'Mirzapur', 'Mollapara',
      'Nagarpara', 'Nawabganj', 'New Bilsimla', 'Noadapara', 'Old Bilsimla', 'Railway Colony',
      'Raipara', 'Rajahata', 'Rajpara', 'Rajshahi University Campus', 'Ramchandrapur',
      'Rampur Bazar', 'Raninagar', 'Saheb Bazar', 'Sagorpara', 'Salagacha', 'Sapura',
      'Sapura Industrial Area', 'Satbaria', 'Sepaipara', 'Serampore', 'Shahajipara',
      'Shahebganj', 'Shalbagan', 'Sheikhpara', 'Shiroil', 'Shiroil Colony', 'Shiroil Mathpukur',
      'Sultanabad', 'Talaimari', 'Tenpukur', 'Terokhadia', 'Tikapara', 'Upashahar',
      'Wapda Colony',
    ],
    // The other upazilas of Rajshahi district: add their villages when you are ready.
    Bagha: [],
    Bagmara: [],
    Charghat: [],
    Durgapur: [],
    Godagari: [],
    Mohanpur: [],
    Paba: [],
    Puthia: [],
    Tanore: [],
  },
  // Other districts: add them the same way, for example
  // Dhaka: { 'Dhanmondi': ['Road 27', 'Road 32'] },
};
