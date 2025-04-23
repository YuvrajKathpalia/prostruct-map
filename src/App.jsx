import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import Select from 'react-select';
import 'leaflet/dist/leaflet.css';
import './App.css';

function App() {
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState(null);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [locationFilter, setLocationFilter] = useState('');
  const [mapCenter, setMapCenter] = useState([42.3601, -71.0589]);
  const [mapZoom, setMapZoom] = useState(3);
  const [loading, setLoading] = useState(true);

  // Delay functionn.

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  useEffect(() => {
    const fetchContacts = async () => {
      try {
        setLoading(true);
        const response = await axios.get('https://prostruct-backend.vercel.app/api/contacts');
        // const response = await axios.get('http://localhost:3000/api/contacts');
        console.log('API Response:', response.data);
        const contactsWithCoords = [];
        for (const contact of response.data) {
          const roles = contact.project_role || ['other'];
          const address = contact.address ; //|| 'Boston, MA'
          console.log(`Processing: ${contact.firstname} ${contact.lastname}, Address: ${address}, Roles: ${roles}`);
          const coords = await geocodeAddress(address, roles);
          const cityState = await parseCityState(address);
          contactsWithCoords.push({ ...contact, coords, cityState, project_role: roles });
          await delay(1000); 
        }
        setContacts(contactsWithCoords);

        const firstValidContact = contactsWithCoords.find(c => c.coords && c.coords.length > 0);
        if (firstValidContact && firstValidContact.coords[0]) {
          setMapCenter([firstValidContact.coords[0].lat, firstValidContact.coords[0].lng]);
          setMapZoom(12);
        }
      } catch (err) {
        setError('Failed to fetch contacts: ' + err.message);
        console.error('Fetch Error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchContacts();
  }, []);

  const geocodeAddress = async (address, roles) => {
    const cacheKey = `geocode_${address.replace(/\s+/g, '_')}`; 
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${address}`);
      return JSON.parse(cached);
    }
  
    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: address,
          format: 'json',
          limit: 1,
        },
        headers: {
          'User-Agent': 'ProStruct/1.0 (yuvraj.kathpalia20@gmail.com)',
        },
      });
      console.log(`Geocoding Address: ${address}, Response:`, response.data);
      if (response.data[0]) {
        const lat = parseFloat(response.data[0].lat);
        const lng = parseFloat(response.data[0].lon);
        const offsets = roles.map((_, index) => ({
          lat: lat + index * 0.0005,
          lng: lng + index * 0.0005,
        }));
        localStorage.setItem(cacheKey, JSON.stringify(offsets));
        return offsets;
      }
    } catch (err) {
      console.error(`Geocoding error for ${address}:`, err.message);
    }
  
    // Fallback coordinates
    const fallback = roles.map((_, index) => ({
      lat: 42.3601 + index * 0.0005,
      lng: -71.0589 + index * 0.0005,
    }));
    localStorage.setItem(cacheKey, JSON.stringify(fallback));
    return fallback;
  };
  
  const parseCityState = async (address) => {
    if (!address) return 'Boston, MA';
    const cacheKey = `citystate_${address.replace(/\s+/g, '_')}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      console.log(`Cache hit for city/state: ${address}`);
      return cached;
    }
  
    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: address,
          format: 'json',
          limit: 1,
          addressdetails: 1,
        },
        headers: {
          'User-Agent': 'ProStruct/1.0 (yuvraj.kathpalia20@gmail.com)',
        },
      });
      if (response.data[0] && response.data[0].address) {
        const { city, town, state, country } = response.data[0].address;
        const cityName = city || town || '';
        let result = address;
        if (cityName && state) result = `${cityName}, ${state}`;
        else if (cityName && country) result = `${cityName}, ${country}`;
        else if (cityName) result = cityName;
        else if (state && country) result = `${state}, ${country}`;
        localStorage.setItem(cacheKey, result);
        return result;
      }
      localStorage.setItem(cacheKey, address);
      return address;
    } catch (err) {
      console.error(`City/State parsing error for ${address}:`, err.message);
      localStorage.setItem(cacheKey, address);
      return address;
    }
  };

  const getMarkerIcon = (role) => {
    const iconColors = {
      contractor: 'blue',
      home_owner: 'green',
      affiliate: 'violet',
      referral_partner: 'orange',
      community_partner: 'red',
      geo_tech: 'yellow',
      other: 'grey'
    };
    const color = iconColors[role];
    console.log(`Role: ${role}, Color: ${color}`);
    return new L.Icon({
      iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
      shadowUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
  };

  const roleOptions = [
    { value: 'contractor', label: 'Contractor', color: '#3b82f6' },
    { value: 'home_owner', label: 'Home Owner', color: '#22c55e' },
    { value: 'affiliate', label: 'Affiliate', color: '#a855f7' },
    { value: 'referral_partner', label: 'Referral Partner', color: '#f97316' },
    { value: 'community_partner', label: 'Community Partner', color: '#ef4444' },
    { value: 'geo_tech', label: 'Geo Tech', color: '#eab308' },
  ];

  const filteredContacts = useMemo(() => {
    return contacts.filter((contact) => {
      const roles = contact.project_role || ['other'];
      const roleMatch =
        selectedRoles.length === 0 ||
        roles.some((role) => selectedRoles.some((r) => r.value === role));
      const locationMatch =
        !locationFilter ||
        (contact.cityState && contact.cityState.toLowerCase().includes(locationFilter.toLowerCase())) ||
        (contact.address && contact.address.toLowerCase().includes(locationFilter.toLowerCase()));
      return roleMatch && locationMatch;
    });
  }, [contacts, selectedRoles, locationFilter]);

  const selectStyles = {
    control: (styles) => ({
      ...styles,
      width: '300px',
      borderRadius: '8px',
      border: '1px solid #ccc',
      padding: '4px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    }),
    multiValue: (styles, { data }) => ({
      ...styles,
      backgroundColor: data.color,
      borderRadius: '4px',
      color: 'white',
    }),
    multiValueLabel: (styles) => ({
      ...styles,
      color: 'white',
      padding: '2px 6px',
    }),
    multiValueRemove: (styles) => ({
      ...styles,
      color: 'white',
      ':hover': {
        backgroundColor: '#555',
        color: 'white',
      },
    }),
    menu: (styles) => ({
      ...styles,
      zIndex: 9999,
      position: 'absolute',
      width: '300px',
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999
    }),
    option: (styles, { isFocused }) => ({
      ...styles,
      backgroundColor: isFocused ? '#e6f0ff' : 'white',
      color: '#333',
      cursor: 'pointer',
    }),
  };

  return (
    <div className="app">
      <header className="header">
        <h1>ProStruct Engineering Contact Map</h1>
      </header>
      {error && <p className="error">{error}</p>}
      {loading && <p className="loading">Loading contacts...</p>}
      <div className="container">
        <div className="filters">
          <div className="filter-group">
            <label>Filter by Role</label>
            <Select
              isMulti
              options={roleOptions}
              value={selectedRoles}
              onChange={setSelectedRoles}
              styles={selectStyles}
              placeholder="Select roles..."
              menuPosition="fixed"
              menuPlacement="auto"
              menuPortalTarget={document.body}
            />
          </div>
          <div className="filter-group">
            <label>Filter by Location</label>
            <input
              type="text"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              placeholder="e.g., Boston"
              className="location-input"
            />
          </div>
          <div className="filter-group">
            <label>&nbsp;</label>
            <button
              onClick={() => {
                setSelectedRoles([]);
                setLocationFilter('');
              }}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                border: 'none',
                background: '#ef4444',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '600',
                transition: 'background 0.2s',
              }}
              onMouseOver={(e) => (e.target.style.background = '#dc2626')}
              onMouseOut={(e) => (e.target.style.background = '#ef4444')}
            >
              Reset Filters
            </button>
          </div>
        </div>
        <div className="legend">
          <h3>Role Legend</h3>
          <div className="legend-items">
            {roleOptions.map((role) => (
              <div
                key={role.value}
                className={`legend-item ${selectedRoles.some((r) => r.value === role.value) ? 'selected' : ''}`}
                title={`Filter by ${role.label}`}
                onClick={() => {
                  if (selectedRoles.some((r) => r.value === role.value)) {
                    setSelectedRoles(selectedRoles.filter((r) => r.value !== role.value));
                  } else {
                    setSelectedRoles([...selectedRoles, role]);
                  }
                }}
              >
                <span className="legend-icon" style={{ backgroundColor: role.color }}></span>
                <span>{role.label}</span>
              </div>
            ))}
          </div>
        </div>
        <MapContainer center={mapCenter} zoom={mapZoom} className="map">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='<a href="https://www.openstreetmap.org/copyright" style="color: #3b82f6; font-size: 0.8rem;">OpenStreetMap</a> contributors'
          />
          {filteredContacts.map((contact) =>
            (contact.project_role || ['other'])
              .filter((role) => selectedRoles.length === 0 || selectedRoles.some((r) => r.value === role))
              .map((role, index) => {
                if (contact.coords && contact.coords[index]) {
                  console.log(
                    `Rendering Marker: ${contact.firstname} ${contact.lastname}, Role: ${role}, Coords:`,
                    contact.coords[index]
                  );
                  return (
                    <Marker
                      key={`${contact.id || contact.email}-${role}-${index}`}
                      position={[contact.coords[index].lat, contact.coords[index].lng]}
                      icon={getMarkerIcon(role)}
                    >
                      <Popup>
                        <b>
                          {contact.firstname} {contact.lastname}
                        </b>
                        <br />
                        Email: <a href={`mailto:${contact.email}`}>{contact.email}</a>
                        <br />
                        Phone: {contact.phone || 'N/A'}
                        <br />
                        Role: {role}
                        <br />
                        Address: {contact.address || 'N/A'}
                      </Popup>
                    </Marker>
                  );
                }
                return null;
              })
          )}
        </MapContainer>
        <div className="suggestions">
          <h3>Suggested Contacts ({filteredContacts.length})</h3>
          {filteredContacts.length > 0 ? (
            <ul>
              {filteredContacts.map((contact) =>
                (contact.project_role || ['other'])
                  .filter((role) => selectedRoles.length === 0 || selectedRoles.some((r) => r.value === role))
                  .map((role) => (
                    <li key={`${contact.id || contact.email}-${role}`}>
                      Contact{' '}
                      <strong>
                        {contact.firstname} {contact.lastname}
                      </strong>{' '}
                      in {contact.cityState || 'N/A'} as a {role}.{' '}
                      <a href={`mailto:${contact.email}`} style={{ color: '#3b82f6' }}>
                        Email
                      </a>
                      {contact.phone && (
                        <>
                          {' | '}
                          <a href={`tel:${contact.phone}`} style={{ color: '#3b82f6' }}>
                            Call
                          </a>
                        </>
                      )}
                    </li>
                  ))
              )}
            </ul>
          ) : (
            <p>No matches found with current filters.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;