import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Image, 
  TextInput, 
  TouchableOpacity, 
  ScrollView,
  Appearance,
  PermissionsAndroid,
  Platform,
  AppState,
  RefreshControl,
  ImageBackground, // Thêm ImageBackground
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { BlurView } from 'expo-blur';

const OPENWEATHER_API_KEY = 'c25a2c1515c1c72e695981dbc07d62fa'; // Thay bằng API key của bạn


const { width, height } = Dimensions.get('window');

async function registerForPushNotificationsAsync() {
  let token;
  
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('weather', {
      name: 'Weather Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Constants.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      alert('Không thể gửi thông báo vì chưa được cấp quyền!');
      return;
    }
    token = (await Notifications.getExpoPushTokenAsync()).data;
  }

  return token;
}

const WeatherApp = () => {
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [city, setCity] = useState('London');
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(Appearance.getColorScheme());
  const [offlineData, setOfflineData] = useState(null);
  const [expoPushToken, setExpoPushToken] = useState('');
  const notificationListener = useRef();
  const responseListener = useRef();
  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [hourlyForecast, setHourlyForecast] = useState([]);


  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchWeatherData(city).then(() => {
      setRefreshing(false);
    });
  }, [city]);

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => setExpoPushToken(token));

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      // Xử lý khi nhận được notification
      console.log(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      // Xử lý khi người dùng tương tác với notification
      console.log(response);
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  // Gửi thông báo thời tiết
  const sendWeatherNotification = async (weatherData) => {
    if (!weatherData) return;

    try {
      // Kiểm tra nhiệt độ cao
      if (weatherData.main.temp > 27) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Cảnh báo nhiệt độ cao 🌡️",
            body: `Nhiệt độ hiện tại là ${weatherData.main.temp}°C. Hãy uống đủ nước!`,
            data: { weatherData },
          },
          trigger: null, // Gửi ngay lập tức
        });
      }

      // Kiểm tra mưa
      if (weatherData.weather[0].main === 'Rain') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Trời đang mưa ☔",
            body: "Nhớ mang theo ô khi ra ngoài nhé!",
            data: { weatherData },
          },
          trigger: null,
        });
      }

      // Cảnh báo gió mạnh
      if (weatherData.wind.speed > 4) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Cảnh báo gió mạnh 💨",
            body: `Tốc độ gió: ${weatherData.wind.speed}m/s. Hạn chế ra ngoài!`,
            data: { weatherData },
          },
          trigger: null,
        });
      }
    } catch (error) {
      console.error('Lỗi gửi thông báo:', error);
    }
  };


  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setTheme(colorScheme);
    });

    return () => subscription.remove();
  }, []);

  // Lưu dữ liệu ngoại tuyến
  const saveOfflineData = async (data) => {
    try {
      await AsyncStorage.setItem('weatherData', JSON.stringify(data));
    } catch (error) {
      console.error('Lỗi lưu dữ liệu ngoại tuyến:', error);
    }
  };

  // Tải dữ liệu ngoại tuyến
  const loadOfflineData = async () => {
    try {
      const savedData = await AsyncStorage.getItem('weatherData');
      if (savedData) {
        setOfflineData(JSON.parse(savedData));
      }
    } catch (error) {
      console.error('Lỗi tải dữ liệu ngoại tuyến:', error);
    }
  };

  const requestLocationPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          return true;
        } else {
          return false;
        }
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  const getCurrentLocation = async () => {
    const hasPermission = await requestLocationPermission();
    if (hasPermission) {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('Permission to access location was denied');
          return;
        }

        let location = await Location.getCurrentPositionAsync({});
        const { latitude, longitude } = location.coords;
        
        // Fetch weather by coordinates
        const response = await axios.get(
          `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${OPENWEATHER_API_KEY}&units=metric`
        );
        
        setCity(response.data.name);
      } catch (error) {
        console.error('Lỗi lấy vị trí:', error);
      }
    }
  };

 // Thông báo thời tiết
 const scheduleWeatherNotification = async (weatherData) => {
  // Kiểm tra điều kiện thời tiết
  if (weatherData.main.temp > 35) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Cảnh báo thời tiết 🌡️",
        body: "Nhiệt độ rất cao, hãy chú ý bảo vệ sức khỏe!",
      },
      trigger: null, // Ngay lập tức
    });
  }

  if (weatherData.weather[0].main === 'Rain') {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Dự báo mưa 🌧️",
        body: "Hôm nay có mưa, đừng quên mang theo ô!",
      },
      trigger: null,
    });
  }
};

  // Hàm fetch dữ liệu thời tiết
  const fetchWeatherData = async (cityName) => {
    try {
      setLoading(true);
      const currentResponse = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?q=${cityName}&appid=${OPENWEATHER_API_KEY}&units=metric`
      );

      const forecastResponse = await axios.get(
        `https://api.openweathermap.org/data/2.5/forecast?q=${cityName}&appid=${OPENWEATHER_API_KEY}&units=metric`
      );
    const hourlyData = forecastResponse.data.list
    .slice(0, 7) // Lấy 8 mốc thời gian tiếp theo
    .map(hourData => ({
      time: new Date(hourData.dt * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      temp: Math.round(hourData.main.temp),
      icon: getWeatherIcon(hourData.weather[0].main)
    }));
    setHourlyForecast(hourlyData);

      const dailyForecast = forecastResponse.data.list.filter((reading) => 
        reading.dt_txt.includes('12:00:00')
      ).slice(0, 9);

      setWeather(currentResponse.data);
      setForecast(dailyForecast);
      

      await saveOfflineData({
        current: currentResponse.data,
        forecast: dailyForecast
      });

      // Gửi thông báo nếu cần
      await sendWeatherNotification(currentResponse.data);
      
      setLoading(false);
    } catch (error) {
      console.error('Lỗi tải dữ liệu:', error);
      
      // Sử dụng dữ liệu ngoại tuyến nếu có
      if (offlineData) {
        setWeather(offlineData.current);
        setForecast(offlineData.forecast);
      }
      
      setLoading(false);
    }
  };

  // Khởi tạo
  useEffect(() => {
    loadOfflineData();
    getCurrentLocation();
  }, []);

  // Theo dõi thay đổi thành phố
  useEffect(() => {
    fetchWeatherData(city);
  }, [city]);

 
  // Hàm xác định icon thời tiết
  const getWeatherIcon = (condition) => {
    const iconMap = {
    'Clear': require('./assets/icons/sunny.png'),
    'Sunny': require('./assets/icons/sunny.png'),

    // Các loại mây
    'Clouds': require('./assets/icons/cloudy.png'),
    'Few clouds': require('./assets/icons/partly-cloudy.png'), 
    'Overcast clouds': require('./assets/icons/overcast.png'),

    // Các loại mưa
    'Rain': require('./assets/icons/rainy.png'),
    'Light rain': require('./assets/icons/light-rain.png'),
    'Moderate rain': require('./assets/icons/moderate-rain.png'),
    'Heavy rain': require('./assets/icons/heavy-rain.png'),


    // Giông bão
    'Thunderstorm': require('./assets/icons/thunderstorm.png'),
    'Thunderstorm with light rain': require('./assets/icons/thunderstorm-rain.png'),

    // Tuyết
    'Snow': require('./assets/icons/snow.png'),

    // Sương mù và các hiện tượng khác
    'Mist': require('./assets/icons/mist.png'),
    'Fog': require('./assets/icons/fog.png'),
    'Tornado': require('./assets/icons/tornado.png'),

    // Thời tiết ban đêm
    'Clear-night': require('./assets/icons/clear-night.png'),
    'Partly-cloudy-night': require('./assets/icons/partly-cloudy-night.png'),
      'default': require('./assets/icons/default.png')
    };
    const isNight = () => {
      const hour = new Date().getHours();
      return hour >= 18 || hour < 5;
    };
  

    if (isNight()) {
      if (condition === 'Clear') {
        return iconMap['Clear-night'];
      }
      if (condition === 'Few clouds') {
        return iconMap['Partly-cloudy-night'];
      }
    }
  

    return iconMap[condition] || iconMap['default'];
  };

 
  const handleSearch = () => {
    if (searchText.trim()) {
      setCity(searchText.trim());
      fetchWeatherData(searchText.trim());
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Đang tải...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme === 'dark' ? '#FFFFFF' : '#000000'}
            colors={['#007AFF']} // Android
            progressBackgroundColor="#FFFFFF" // Android
          />
        }
      >
        {/* Thanh tìm kiếm */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Nhập tên thành phố"
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity 
            style={styles.searchButton}
            onPress={handleSearch}
          >
            <Text style={styles.searchButtonText}>Tìm kiếm</Text>
          </TouchableOpacity>
        </View>

        {weather && (
          <View style={styles.weatherCard}>
            {/* Thông tin thành phố và nhiệt độ chính */}
            <View style={styles.mainWeatherInfo}>
              <Text style={styles.cityName}>
                {weather.name}, {weather.sys.country}
              </Text>
              <View style={styles.temperatureContainer}>
                <Image
                  source={getWeatherIcon(weather.weather[0].main)}
                  style={styles.weatherIcon}
                />
                <Text style={styles.temperature}>
                  {Math.round(weather.main.temp)}°C
                </Text>
              </View>
              <Text style={styles.description}>
                {weather.weather[0].description}
              </Text>
            </View>
             {/* Dự báo theo giờ */}
              <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Dự Báo Theo Giờ</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hourlyForecastScroll}
              >
                {hourlyForecast.map((hour, index) => (
                  <View key={index} style={styles.hourlyForecastItem}>
                    <Text style={styles.hourlyTime}>{hour.time}</Text>
                    <Image 
                      source={hour.icon} 
                      style={styles.hourlyIcon} 
                    />
                    <Text style={styles.hourlyTemp}>{hour.temp}°C</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
            {/* Dự báo ngày */}
            <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Dự Báo Theo Ngày</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.dailyForecastContainer}
            >
              {forecast.map((day, index) => (
                <View key={index} style={styles.dailyForecastItem}>
                  <Text style={styles.dailyForecastDay}>
                    {new Date(day.dt * 1000).toLocaleDateString('vi-VN', { weekday: 'short' })}
                  </Text>
                  <Image
                    source={getWeatherIcon(day.weather[0].main)}
                    style={styles.dailyForecastIcon}
                  />
                  <Text style={styles.dailyForecastTemp}>
                    {Math.round(day.main.temp_min)}°C / {Math.round(day.main.temp_max)}°C
                  </Text>
                </View>
              ))}
            </ScrollView>
            </View>         

            {/* Chi tiết mở rộng */}
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Chi Tiết Thời Tiết</Text>
              <View style={styles.detailsGrid}>
                <View style={styles.detailGridItem}>
                  <Text style={styles.detailLabel}>Độ Ẩm</Text>
                  <Text style={styles.detailValue}>{weather.main.humidity}%</Text>
                </View>
                <View style={styles.detailGridItem}>
                  <Text style={styles.detailLabel}>Áp Suất</Text>
                  <Text style={styles.detailValue}>{weather.main.pressure} hPa</Text>
                </View>
                <View style={styles.detailGridItem}>
                  <Text style={styles.detailLabel}>Tầm Nhìn</Text>
                  <Text style={styles.detailValue}>
                    {(weather.visibility / 1000).toFixed(1)} km
                  </Text>
                </View>
                <View style={styles.detailGridItem}>
                  <Text style={styles.detailLabel}>Tốc Độ Gió</Text>
                  <Text style={styles.detailValue}>{weather.wind.speed} m/s</Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
      {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#FFFFFF" />
              </View>
            )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingVertical: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'white',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
    marginRight: 10,
    elevation: 2,
  },
  searchButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  searchButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  weatherCard: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
    elevation: 3,
  },
  mainWeatherInfo: {
    alignItems: 'center',
    marginBottom: 20,
  },
  cityName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  temperatureContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  weatherIcon: {
    width: 80,
    height: 80,
    marginRight: 15,
  },
  temperature: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#333',
  },
  description: {
    fontSize: 16,
    color: '#666',
    textTransform: 'capitalize',
  },
  sectionContainer: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  dailyForecastContainer: {
    marginTop: 10,
  },
  dailyForecastItem: {
    alignItems: 'center',
    marginRight: 15,
    backgroundColor: '#f9f9f9',
    padding: 10,
    borderRadius: 10,
  },
  dailyForecastDay: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  dailyForecastIcon: {
    width: 50,
    height: 50,
    marginBottom: 5,
  },
  dailyForecastTemp: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  hourlyForecastScroll: {
    paddingRight: 20,
  },
  hourlyForecastItem: {
    alignItems: 'center',
    marginRight: 15,
    backgroundColor: '#f9f9f9',
    padding: 10,
    borderRadius: 10,
  },
  hourlyTime: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  hourlyIcon: {
    width: 50,
    height: 50,
    marginBottom: 5,
  },
  hourlyTemp: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  detailGridItem: {
    width: '48%',
    backgroundColor: '#f9f9f9',
    padding: 15,
    borderRadius: 10,
    marginVertical: 10,
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
});


export default WeatherApp;