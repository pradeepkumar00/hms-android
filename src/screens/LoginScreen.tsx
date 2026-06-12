import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector, selectAuth } from '../store';
import { loginUser, clearError } from '../store/authSlice';
import { validateLoginForm } from '../utils/validation';
import { theme } from '../constants/theme';
import { APP_CONFIG } from '../constants/app';
const AppLogo = require('../../assets/images/app-logo.jpeg');

interface LoginScreenProps {
  navigation: any; // Will be properly typed when navigation is set up
}

const LoginScreen: React.FC<LoginScreenProps> = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showPassword, setShowPassword] = useState(false);

  // Refs for focus management
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const dispatch = useAppDispatch();
  const { isLoading, error, isAuthenticated } = useAppSelector(selectAuth);

  useEffect(() => {
    // Clear errors when component mounts
    dispatch(clearError());
  }, [dispatch]);

  useEffect(() => {
    // Navigate to main screen if authenticated
    // AppNavigator handles this automatically through conditional rendering
    // This useEffect is kept for logging purposes only
    if (isAuthenticated) {
      console.log('✅ User authenticated - AppNavigator will show Main screen');
      // Don't manually navigate - AppNavigator will automatically show Main screen
      // when isAuthenticated becomes true
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // Show authentication error inline instead of alert
    if (error) {
      // Check if it's an invalid credentials error
      if (
        error.includes('Invalid email or password') ||
        error.includes('Invalid') ||
        error.includes('password')
      ) {
        setErrors(prev => ({ ...prev, auth: error }));
      } else {
        // For server errors, still show alert
        Alert.alert('Login Failed', error, [
          { text: 'OK', onPress: () => dispatch(clearError()) },
        ]);
      }
      dispatch(clearError());
    }
  }, [error, dispatch]);

  const handleEmailChange = (text: string) => {
    setEmail(text);
    // Clear email and auth errors when user starts typing
    if (errors.email || errors.auth) {
      setErrors(prev => ({ ...prev, email: '', auth: '' }));
    }
  };

  const handlePasswordChange = (text: string) => {
    setPassword(text);
    // Clear password and auth errors when user starts typing
    if (errors.password || errors.auth) {
      setErrors(prev => ({ ...prev, password: '', auth: '' }));
    }
  };

  const handleLogin = async () => {
    // Clear previous errors
    setErrors({});

    // Validate form
    const validationErrors = validateLoginForm(email, password);

    if (validationErrors.length > 0) {
      const errorMap: { [key: string]: string } = {};
      validationErrors.forEach(error => {
        errorMap[error.field] = error.message;
      });
      setErrors(errorMap);
      return;
    }

    // Dispatch login action
    try {
      await dispatch(
        loginUser({
          email: email.trim().toLowerCase(),
          password,
        }),
      ).unwrap();
    } catch (error) {
      // Error is handled in useEffect above
      console.error('Login error:', error);
    }
  };

  const handleForgotPassword = () => {
    // TODO: Implement forgot password functionality
    Alert.alert(
      'Forgot Password',
      'Please contact your administrator to reset your password.',
      [{ text: 'OK' }],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            {/* App Logo - Placeholder for logo implementation */}
            <View style={styles.logoContainer}>
              <View style={styles.logoPlaceholder}>
                <Image source={AppLogo} style={styles.logo} />
              </View>
            </View>
            <Text style={styles.title}>{APP_CONFIG.name}</Text>
            <Text style={styles.subtitle}>
              Welcome back! Please sign in to continue.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                ref={emailRef}
                style={[styles.input, errors.email ? styles.inputError : null]}
                placeholder="Enter your email address"
                placeholderTextColor={theme.colors.placeholder}
                value={email}
                onChangeText={handleEmailChange}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                editable={!isLoading}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                blurOnSubmit={false}
              />
              {errors.email ? (
                <Text style={styles.errorText}>{errors.email}</Text>
              ) : null}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  ref={passwordRef}
                  style={[
                    styles.passwordInput,
                    errors.password ? styles.inputError : null,
                  ]}
                  placeholder="Enter your password"
                  placeholderTextColor={theme.colors.placeholder}
                  value={password}
                  onChangeText={handlePasswordChange}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isLoading}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                >
                  <Text style={styles.eyeText}>
                    {showPassword ? '🙈' : '👁'}
                  </Text>
                </TouchableOpacity>
              </View>
              {errors.password ? (
                <Text style={styles.errorText}>{errors.password}</Text>
              ) : null}
            </View>

            {/* Authentication Error Display */}
            {errors.auth ? (
              <View style={styles.authErrorContainer}>
                <Text style={styles.authErrorText}>{errors.auth}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={handleForgotPassword}
              disabled={isLoading}
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.loginButton,
                isLoading && styles.loginButtonDisabled,
              ]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={theme.colors.surface} size="small" />
              ) : (
                <Text style={styles.loginButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Powered by OctusAi</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  logoContainer: {
    marginBottom: theme.spacing.lg,
    alignItems: 'center',
  },
  logoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.sm,
    overflow: 'hidden',
  },
  logo: {
    height: 80,
    width: 80,
    borderRadius: 10,
    resizeMode: 'cover',
  },
  title: {
    fontSize: theme.typography.fontSizes.xxxl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeights.normal,
  },
  form: {
    marginBottom: theme.spacing.xl,
  },
  inputContainer: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  inputError: {
    borderColor: theme.colors.error,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  eyeButton: {
    position: 'absolute',
    right: theme.spacing.md,
    padding: theme.spacing.sm,
  },
  eyeText: {
    fontSize: theme.typography.fontSizes.lg,
  },
  errorText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: theme.spacing.lg,
  },
  forgotPasswordText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.primary,
  },
  loginButton: {
    height: 50,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
  footer: {
    alignItems: 'center',
    paddingTop: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeights.medium,
    textAlign: 'center',
  },
  authErrorContainer: {
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.sm,
    backgroundColor: '#FFEBEE', // Light red background
    borderRadius: theme.borderRadius.sm,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.error,
  },
  authErrorText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.error,
    fontWeight: theme.typography.fontWeights.medium,
    textAlign: 'center',
  },
});

export default LoginScreen;
